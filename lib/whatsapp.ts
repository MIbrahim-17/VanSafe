import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { interpretWhatsApp, summarizeReviews, answerBotQuestion } from "@/lib/gemini";
import { reverseGeocode } from "@/lib/geocode";
import { estimateEta } from "@/lib/eta";
import { googleMapsLink, relativeTime } from "@/lib/utils";
import type { BaseRoute, Child, Driver, LocationPing, Profile, Review } from "@/lib/types";

type Admin = ReturnType<typeof createAdminClient>;

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
 *
 * Identifies the sender, classifies intent (AI + rule fallback), and replies.
 * To stay robust in a stateless channel (WhatsApp sends no history), it never
 * asks "which child?" — when a child isn't named it answers for ALL linked
 * children. Fixed intents are answered deterministically; anything else is
 * handled by the OpenRouter (Gemini) free-form answerer over the live data, with
 * a deterministic fallback so it always replies.
 */
export async function handleIncoming(from: string, text: string): Promise<string> {
  const admin = createAdminClient();
  const fromDigits = digits(from);

  const { data: profiles } = await admin.from("profiles").select("*").eq("role", "parent");
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
      ? 'آپ پوچھ سکتے ہیں: "وین کہاں ہے؟"، "وین کب اسکول پہنچے گی؟"، یا "ڈرائیور کے بارے میں بتائیں" — میں فوراً جواب دوں گا۔'
      : 'You can ask me: "where is the van?", "when will it reach school?", or "tell me about the driver" — and I\'ll reply with live info.';
  }
  if (intent === "greeting") {
    return lang === "ur"
      ? `سلام ${parent.name}! میں وین کی لوکیشن، اسکول پہنچنے کا وقت، اور ڈرائیور کی تفصیلات بتا سکتا ہوں۔`
      : `Hello ${parent.name}! I can share the van's live location, its ETA to school, and the driver's details. Just ask.`;
  }

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
  if (linked.length === 0) {
    return lang === "ur"
      ? "آپ کے کسی بچے کی ابھی کوئی وین منتخب نہیں۔ ایپ میں جا کر وین منتخب کریں۔"
      : "None of your children are linked to a van yet. Open the app to choose a van.";
  }

  // If a child is named (fuzzy, so typos like "Ayehsa" still match), answer for
  // them; otherwise answer for every linked child — no lossy "which child?".
  const named = matchChildren(children, text);
  let targets: Child[];
  if (named.length) {
    const namedLinked = named.filter((c) => c.driver_id);
    if (!namedLinked.length) {
      return lang === "ur"
        ? `${named[0].name} کی ابھی کوئی وین منتخب نہیں۔ ایپ میں جا کر وین منتخب کریں۔`
        : `${named[0].name} isn't linked to a van yet. Open the app to choose one.`;
    }
    targets = namedLinked;
  } else {
    targets = linked;
  }

  const wantsHome = /home|ghar|گھر|واپس|house|wapas/.test(text.toLowerCase());
  const snaps = await Promise.all(targets.map((c) => snapshot(admin, c)));

  switch (intent) {
    case "where":
    case "status":
      return (await Promise.all(snaps.map((s) => locationLine(s, lang)))).join("\n\n");
    case "eta":
      return (await Promise.all(snaps.map((s) => etaLine(s, wantsHome, lang)))).join("\n\n");
    case "driver_info":
      return (await Promise.all(snaps.map((s) => driverLine(s, lang)))).join("\n\n");
    default:
      return smartAnswer(text, snaps, lang);
  }
}

// ---------------------------------------------------------------------------
// Bot helpers
// ---------------------------------------------------------------------------

/** A child plus everything the bot may need to answer about their van. */
interface Snapshot {
  child: Child;
  driverName: string;
  driver: Driver | null;
  latest: LocationPing | null;
  base: BaseRoute | null;
}

async function snapshot(admin: Admin, child: Child): Promise<Snapshot> {
  const driverId = child.driver_id as string;
  const [{ data: prof }, { data: drv }, { data: pings }, { data: route }] = await Promise.all([
    admin.from("profiles").select("name").eq("id", driverId).single(),
    admin.from("drivers").select("*").eq("id", driverId).single(),
    admin.from("locations").select("*").eq("driver_id", driverId).order("created_at", { ascending: false }).limit(1),
    admin.from("routes").select("*").eq("driver_id", driverId).maybeSingle(),
  ]);
  return {
    child,
    driverName: (prof as { name: string } | null)?.name ?? "the driver",
    driver: (drv as Driver | null) ?? null,
    latest: (pings as LocationPing[] | null)?.[0] ?? null,
    base: (route as BaseRoute | null) ?? null,
  };
}

async function locationLine(s: Snapshot, lang: "en" | "ur"): Promise<string> {
  if (!s.latest) {
    return lang === "ur"
      ? `${s.child.name} کی وین (${s.driverName}) نے ابھی ٹریکنگ شروع نہیں کی۔`
      : `${s.child.name}'s van (${s.driverName}) hasn't started sharing location yet today.`;
  }
  const mapsLink = googleMapsLink(s.latest.lat, s.latest.lng);
  const when = relativeTime(s.latest.created_at);
  const place = await reverseGeocode(s.latest.lat, s.latest.lng);
  const at = place ? `\n📍 ${place}` : "";
  return lang === "ur"
    ? `${s.child.name} کی وین (${s.driverName}) کی آخری لوکیشن (${when}):${at}\n${mapsLink}`
    : `${s.child.name}'s van (${s.driverName}) — last seen ${when}:${at}\n${mapsLink}`;
}

async function etaLine(s: Snapshot, wantsHome: boolean, lang: "en" | "ur"): Promise<string> {
  if (!s.latest) {
    return lang === "ur"
      ? `${s.child.name} کی وین (${s.driverName}) نے ابھی ٹریکنگ شروع نہیں کی، اس لیے وقت کا اندازہ ممکن نہیں۔`
      : `${s.child.name}'s van (${s.driverName}) isn't sharing location yet, so I can't estimate the time.`;
  }
  const b = s.base;
  const target =
    wantsHome && b?.home_lat != null && b?.home_lng != null
      ? { lat: b.home_lat, lng: b.home_lng, label: lang === "ur" ? "گھر" : "home" }
      : b?.school_lat != null && b?.school_lng != null
      ? { lat: b.school_lat, lng: b.school_lng, label: b.school_name || (lang === "ur" ? "اسکول" : "school") }
      : null;
  if (!target) {
    return lang === "ur"
      ? `${s.driverName} نے ابھی اپنا راستہ سیٹ نہیں کیا، اس لیے وقت کا اندازہ ممکن نہیں۔`
      : `${s.driverName} hasn't set up their route yet, so I can't estimate the time.`;
  }
  const eta = await estimateEta(
    { lat: s.latest.lat, lng: s.latest.lng },
    { lat: target.lat, lng: target.lng },
    { traffic: true }
  );
  const mins = Math.max(1, Math.round(eta.durationTrafficS / 60));
  return lang === "ur"
    ? `${s.child.name} کی وین (${s.driverName}) تقریباً ${mins} منٹ میں ${target.label} پہنچ جائے گی۔`
    : `${s.child.name}'s van (${s.driverName}) should reach ${target.label} in about ${mins} min.`;
}

async function driverLine(s: Snapshot, lang: "en" | "ur"): Promise<string> {
  const d = s.driver;
  if (!d) {
    return lang === "ur"
      ? `${s.driverName} کی پروفائل ابھی دستیاب نہیں۔`
      : `${s.driverName}'s profile isn't available right now.`;
  }
  const { data: reviewRows } = await createAdminClient()
    .from("reviews")
    .select("rating,comment")
    .eq("driver_id", s.child.driver_id as string)
    .order("created_at", { ascending: false })
    .limit(20);
  const reviews = (reviewRows as Pick<Review, "rating" | "comment">[] | null) ?? [];
  const summary = await summarizeReviews(reviews);

  const vehicle = d.make_model || d.vehicle_type;
  const seatsFree = Math.max(0, (d.official_capacity || d.capacity) - d.occupancy);
  const verified = d.verified
    ? lang === "ur" ? "تصدیق شدہ ✅" : "Verified ✅"
    : lang === "ur" ? "غیر تصدیق شدہ" : "Not yet verified";

  return lang === "ur"
    ? `🧑‍✈️ ${s.driverName} (${s.child.name} کی وین)\nگاڑی: ${vehicle}${d.plate ? ` (${d.plate})` : ""}\nریٹنگ: ${d.rating}/5 (${d.review_count} ریویوز) · ${verified}\nخالی سیٹیں: ${seatsFree}\n📝 ${summary}`
    : `🧑‍✈️ ${s.driverName} (${s.child.name}'s van)\nVehicle: ${vehicle}${d.plate ? ` (${d.plate})` : ""}\nRating: ${d.rating}/5 (${d.review_count} reviews) · ${verified}\nSeats free: ${seatsFree}\n📝 ${summary}`;
}

/** Free-form questions: assemble live context and let Gemini answer; fall back. */
async function smartAnswer(text: string, snaps: Snapshot[], lang: "en" | "ur"): Promise<string> {
  const context = await Promise.all(
    snaps.map(async (s) => {
      const d = s.driver;
      let etaSchoolMin: number | null = null;
      let place: string | null = null;
      if (s.latest) {
        place = await reverseGeocode(s.latest.lat, s.latest.lng);
        if (s.base?.school_lat != null && s.base?.school_lng != null) {
          const eta = await estimateEta(
            { lat: s.latest.lat, lng: s.latest.lng },
            { lat: s.base.school_lat, lng: s.base.school_lng },
            { traffic: true }
          );
          etaSchoolMin = Math.max(1, Math.round(eta.durationTrafficS / 60));
        }
      }
      return {
        child: s.child.name,
        school: s.child.school,
        driver: d
          ? {
              name: s.driverName,
              vehicle: d.make_model || d.vehicle_type,
              plate: d.plate,
              verified: d.verified,
              rating: d.rating,
              reviews: d.review_count,
              seatsFree: Math.max(0, (d.official_capacity || d.capacity) - d.occupancy),
            }
          : null,
        location: s.latest
          ? {
              place,
              lastSeen: relativeTime(s.latest.created_at),
              mapsLink: googleMapsLink(s.latest.lat, s.latest.lng),
            }
          : null,
        etaToSchoolMin: etaSchoolMin,
      };
    })
  );

  const ai = await answerBotQuestion(text, context, lang);
  if (ai) return ai;

  // Deterministic fallback (no AI key / call failed): answer with locations.
  const lines = await Promise.all(snaps.map((s) => locationLine(s, lang)));
  const hint =
    lang === "ur"
      ? '\n\nآپ پوچھ سکتے ہیں: "وین کب اسکول پہنچے گی؟" یا "ڈرائیور کے بارے میں بتائیں"۔'
      : '\n\nYou can also ask: "when will it reach school?" or "tell me about the driver".';
  return lines.join("\n\n") + hint;
}

/** Levenshtein edit distance (small strings) for fuzzy child-name matching. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Children whose first name appears in the text (exact word or a near-typo). */
function matchChildren(children: Child[], text: string): Child[] {
  const lower = text.toLowerCase();
  // Keep ASCII word chars and the Urdu/Arabic block; split into comparable tokens.
  const tokens = lower
    .replace(/[^\w؀-ۿ\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  return children.filter((c) => {
    const first = c.name.toLowerCase().split(/\s+/)[0];
    if (first.length < 3) return false;
    if (tokens.includes(first)) return true; // exact standalone name (EN or UR)
    const esc = first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${esc}\\b`).test(lower)) return true; // e.g. "ayesha's"
    return tokens.some(
      (t) => Math.abs(t.length - first.length) <= 2 && editDistance(t, first) <= 2
    );
  });
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
