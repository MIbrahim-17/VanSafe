import { createAdminClient } from "@/lib/supabase/admin";
import { interpretWhatsApp } from "@/lib/gemini";
import { reverseGeocode } from "@/lib/geocode";
import { googleMapsLink, relativeTime } from "@/lib/utils";
import type { LinkRow, LocationPing, Profile } from "@/lib/types";

const SIGNUP_URL = "vansafe.app/register";

function whatsappConfigured() {
  return Boolean(
    process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN
  );
}

/**
 * Send a WhatsApp message via the Meta WhatsApp Cloud API (Graph API). When the
 * Cloud API isn't configured this is a no-op — proactive alerts are also
 * persisted to the `alerts` table, which the parent dashboard and the in-app
 * WhatsApp simulator both display.
 */
export async function sendWhatsApp(to: string, body: string): Promise<boolean> {
  if (!whatsappConfigured()) return false;
  try {
    const version = process.env.WHATSAPP_API_VERSION || "v21.0";
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
    const toNumber = digits(to); // E.164 digits, no '+' or 'whatsapp:' prefix
    const res = await fetch(
      `https://graph.facebook.com/${version}/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: toNumber,
          type: "text",
          text: { preview_url: true, body },
        }),
      }
    );
    if (!res.ok) {
      console.error("WhatsApp Cloud API send failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("WhatsApp Cloud API send failed:", err);
    return false;
  }
}

/** Normalise a WhatsApp identifier to a comparable digit string. */
function digits(n: string) {
  return n.replace(/^whatsapp:/, "").replace(/[^\d]/g, "");
}

/**
 * Core inbound logic, shared by the Meta Cloud API webhook and the in-app
 * simulator. Identifies the sender by WhatsApp number, infers intent, and replies.
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

  // Locate the linked driver + latest ping.
  const { data: link } = await admin
    .from("links")
    .select("*")
    .eq("parent_id", parent.id)
    .maybeSingle();

  if (!link) {
    return lang === "ur"
      ? "آپ نے ابھی کسی وین سے لنک نہیں کیا۔ ایپ میں جا کر وین منتخب کریں۔"
      : "You're not linked to a van yet. Open the VanSafe app and choose a van to start tracking.";
  }

  const { data: driverProfile } = await admin
    .from("profiles")
    .select("name")
    .eq("id", (link as LinkRow).driver_id)
    .single();
  const { data: pings } = await admin
    .from("locations")
    .select("*")
    .eq("driver_id", (link as LinkRow).driver_id)
    .order("created_at", { ascending: false })
    .limit(1);

  const latest = (pings as LocationPing[] | null)?.[0];
  const driverName = (driverProfile as { name: string } | null)?.name ?? "your driver";

  if (!latest) {
    return lang === "ur"
      ? `${driverName} نے ابھی ٹریکنگ شروع نہیں کی۔ جب وین چلے گی تو آپ کو اطلاع مل جائے گی۔`
      : `${driverName} hasn't started sharing location yet today. You'll get an alert the moment the van departs.`;
  }

  const link_ = googleMapsLink(latest.lat, latest.lng);
  const when = relativeTime(latest.created_at);
  const place = await reverseGeocode(latest.lat, latest.lng);

  if (lang === "ur") {
    const at = place ? `\n📍 ${place}` : "";
    return `${driverName} کی وین کی آخری لوکیشن (${when}):${at}\n${link_}`;
  }
  const at = place ? `\n📍 ${place}` : "";
  return `${driverName}'s van — last seen ${when}:${at}\n${link_}`;
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
