import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { interpretWhatsApp } from "@/lib/gemini";
import { reverseGeocode } from "@/lib/geocode";
import { googleMapsLink, relativeTime } from "@/lib/utils";
import type { Child, LocationPing, Profile } from "@/lib/types";

const SIGNUP_URL = "vansafe.app/register";

/**
 * Validate Twilio's X-Twilio-Signature on the inbound webhook so only genuine
 * Twilio requests are processed (the public tunnel URL is otherwise open).
 * Algorithm: HMAC-SHA1(authToken) over (fullUrl + each POST param key+value,
 * sorted by key), base64-encoded.
 *
 * - No auth token configured -> allow (sandbox/simulator use).
 * - TWILIO_VALIDATE_SIGNATURE=false -> bypass (escape hatch if the reconstructed
 *   URL ever mismatches behind a proxy).
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null
): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return true;
  if (process.env.TWILIO_VALIDATE_SIGNATURE === "false") return true;
  if (!signature) return false;

  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  const expected = crypto
    .createHmac("sha1", token)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");

  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function twilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_FROM
  );
}

/** Format a number as a Twilio WhatsApp address: whatsapp:+<E.164>. */
function waAddress(n: string): string {
  let num = n.replace(/^whatsapp:/, "").replace(/[^\d+]/g, "");
  if (!num.startsWith("+")) num = "+" + num;
  return `whatsapp:${num}`;
}

/**
 * Send a WhatsApp message via the Twilio REST API. When Twilio isn't configured
 * this is a no-op — proactive alerts are also persisted to the `alerts` table,
 * which the parent dashboard and the in-app WhatsApp simulator both display.
 *
 * Proactive alerts are business-initiated, so outside WhatsApp's 24-hour session
 * window they must use an approved template. If TWILIO_CONTENT_SID is set, the
 * message text is sent as the template's {{1}} variable; otherwise it's sent as
 * a free-form session message (works within the 24h window / Twilio sandbox).
 */
export async function sendWhatsApp(to: string, body: string): Promise<boolean> {
  if (!twilioConfigured()) return false;
  try {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const token = process.env.TWILIO_AUTH_TOKEN!;
    const params = new URLSearchParams({
      From: waAddress(process.env.TWILIO_WHATSAPP_FROM!),
      To: waAddress(to),
    });

    const contentSid = process.env.TWILIO_CONTENT_SID;
    if (contentSid) {
      params.set("ContentSid", contentSid);
      params.set("ContentVariables", JSON.stringify({ "1": body }));
    } else {
      params.set("Body", body);
    }

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );
    if (!res.ok) {
      console.error("Twilio send failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Twilio send failed:", err);
    return false;
  }
}

/** Normalise a WhatsApp identifier to a comparable digit string. */
function digits(n: string) {
  return n.replace(/^whatsapp:/, "").replace(/[^\d]/g, "");
}

/**
 * Core inbound logic, shared by the Twilio webhook and the in-app simulator.
 * Identifies the sender by WhatsApp number, infers intent, and replies.
 */
export async function handleIncoming(from: string, text: string): Promise<string> {
  const admin = createAdminClient();
  const fromDigits = digits(from);

  // Match the sender to a registered parent by the tail of their number.
  const { data: profiles } = await admin
    .from("profiles")
    .select("*")
    .eq("role", "parent");

  const parent = (profiles as Profile[] | null)?.find((p) => {
    const d = digits(p.whatsapp);
    return d && (d === fromDigits || d.endsWith(fromDigits.slice(-9)) || fromDigits.endsWith(d.slice(-9)));
  });

  const { intent, lang } = await interpretWhatsApp(text);

  if (!parent) {
    return lang === "ur"
      ? `سلام! یہ نمبر VanSafe پر رجسٹرڈ نہیں ہے۔ سائن اپ کریں: ${SIGNUP_URL}`
      : `Hi! This number isn't registered on VanSafe yet. Sign up here to track your child's van: ${SIGNUP_URL}`;
  }

  if (intent === "help") {
    return lang === "ur"
      ? "آپ مجھ سے پوچھ سکتے ہیں: \"وین کہاں ہے؟\" یا \"کیا وین چل رہی ہے؟\""
      : 'You can ask me things like "where is the van?" or "is the van moving?" and I\'ll send the live location.';
  }
  if (intent === "greeting") {
    return lang === "ur"
      ? `سلام ${parent.name}! آپ کے بچے کی وین کی لوکیشن کے لیے \"وین کہاں ہے؟\" لکھیں۔`
      : `Hello ${parent.name}! Ask "where is the van?" any time to get the live location.`;
  }

  // Gather the parent's children, then work out which child the message is about.
  const { data: kidsData } = await admin
    .from("children")
    .select("*")
    .eq("parent_id", parent.id)
    .order("created_at");
  const children = (kidsData as Child[] | null) ?? [];

  if (children.length === 0) {
    return lang === "ur"
      ? "آپ نے ابھی کوئی بچہ شامل نہیں کیا۔ ایپ میں جا کر بچہ شامل کریں اور وین منتخب کریں۔"
      : "You haven't added any children yet. Open the VanSafe app to add a child and choose a van.";
  }

  const linked = children.filter((c) => c.driver_id);

  // Did the parent name a child in their message? (e.g. "where is Ali's van?")
  const lower = text.toLowerCase();
  const named = children.filter((c) => {
    const first = c.name.toLowerCase().split(/\s+/)[0];
    return first.length >= 2 && new RegExp(`\\b${first}\\b`).test(lower);
  });

  let chosen: Child | undefined;
  if (named.length === 1) {
    chosen = named[0];
  } else if (named.length > 1) {
    const names = named.map((c) => c.name).join(lang === "ur" ? " یا " : " or ");
    return lang === "ur"
      ? `آپ کا مطلب کون سا بچہ ہے — ${names}؟`
      : `Did you mean ${names}? Reply with the child's name.`;
  } else if (linked.length === 1) {
    chosen = linked[0]; // single linked child -> answer directly
  } else if (linked.length === 0) {
    return lang === "ur"
      ? "آپ کے کسی بچے کی ابھی کوئی وین منتخب نہیں۔ ایپ میں جا کر وین منتخب کریں۔"
      : "None of your children are linked to a van yet. Open the app to choose a van.";
  } else {
    const names = linked.map((c) => c.name).join(lang === "ur" ? " یا " : " or ");
    return lang === "ur"
      ? `آپ کس بچے کے بارے میں پوچھ رہے ہیں؟ نام لکھیں: ${names}`
      : `Which child are you asking about? Reply with a name: ${names}`;
  }

  if (!chosen.driver_id) {
    return lang === "ur"
      ? `${chosen.name} کی ابھی کوئی وین منتخب نہیں۔ ایپ میں جا کر وین منتخب کریں۔`
      : `${chosen.name} isn't linked to a van yet. Open the app to choose one.`;
  }

  const driverId = chosen.driver_id;
  const { data: driverProfile } = await admin
    .from("profiles")
    .select("name")
    .eq("id", driverId)
    .single();
  const { data: pings } = await admin
    .from("locations")
    .select("*")
    .eq("driver_id", driverId)
    .order("created_at", { ascending: false })
    .limit(1);

  const latest = (pings as LocationPing[] | null)?.[0];
  const driverName = (driverProfile as { name: string } | null)?.name ?? "the driver";

  if (!latest) {
    return lang === "ur"
      ? `${chosen.name} کی وین (${driverName}) نے ابھی ٹریکنگ شروع نہیں کی۔`
      : `${chosen.name}'s van (${driverName}) hasn't started sharing location yet today.`;
  }

  const mapsLink = googleMapsLink(latest.lat, latest.lng);
  const when = relativeTime(latest.created_at);
  const place = await reverseGeocode(latest.lat, latest.lng);
  const at = place ? `\n📍 ${place}` : "";

  if (lang === "ur") {
    return `${chosen.name} کی وین (${driverName}) کی آخری لوکیشن (${when}):${at}\n${mapsLink}`;
  }
  return `${chosen.name}'s van (${driverName}) — last seen ${when}:${at}\n${mapsLink}`;
}

/** Build a proactive alert message body for a given event. */
export function alertBody(
  type: "departed" | "arrived",
  driverName: string,
  childName: string
): string {
  if (type === "departed")
    return `🚐 ${driverName}'s van has departed. ${childName} is on the way to school.`;
  return `🏫 ${driverName}'s van has arrived. ${childName} has reached school safely.`;
}
