import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assistantReply,
  driverAssistantReply,
  onboardingReply,
  summarizeReviews,
  type ChatMessage,
} from "@/lib/gemini";
import { reverseGeocode } from "@/lib/geocode";
import { estimateEta } from "@/lib/eta";
import { googleMapsLink, relativeTime } from "@/lib/utils";
import type { BaseRoute, Child, Driver, LocationPing, Profile, Review, TrackingSession } from "@/lib/types";

type Admin = ReturnType<typeof createAdminClient>;

const SIGNUP_URL = "vansafe.app/register";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://van-safe.vercel.app";
const TRACCAR_APP_URL = "https://play.google.com/store/apps/details?id=org.traccar.client";

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
 * AI-first: the assistant (OpenRouter / Gemini 2.5 Flash) composes every reply.
 *  - Registered parent: we gather their live van data (location, ETA, driver,
 *    reviews) and a few prior turns, then let the model answer naturally and
 *    guide them on using VanSafe.
 *  - Registered driver: we gather their VanSafe data (Traccar setup, who's
 *    linked, rating, today's tracking) and let the model answer + guide them.
 *  - Unregistered: the model gives VanSafe onboarding (how/why to sign up).
 *
 * Short conversation memory (last ~2 exchanges per sender) makes follow-ups work
 * without asking "which child?". A deterministic reply is used only when the AI
 * is unavailable (no key / call fails), so the bot always responds.
 */
export async function handleIncoming(from: string, text: string): Promise<string> {
  const admin = createAdminClient();
  const fromDigits = digits(from);
  const lang = detectLang(text); // for deterministic fallback text only
  const history = await loadHistory(admin, fromDigits);

  const { data: profiles } = await admin.from("profiles").select("*").eq("role", "parent");
  const parent = (profiles as Profile[] | null)?.find((p) => {
    const d = digits(p.whatsapp);
    return d && (d === fromDigits || d.endsWith(fromDigits.slice(-9)) || fromDigits.endsWith(d.slice(-9)));
  });

  // --- Not a registered parent: AI driver assistant, else AI onboarding ---
  if (!parent) {
    const driver = await findDriver(admin, fromDigits);
    if (driver) {
      const dctx = await buildDriverContext(admin, driver);
      const ai = await driverAssistantReply(text, dctx, history);
      const reply = ai ?? traccarSetupText(driver.name, dctx.tracking.deviceToken, lang);
      await saveTurn(admin, fromDigits, text, reply);
      return reply;
    }
    const ai = await onboardingReply(text, history);
    const reply =
      ai ??
      (lang === "ur"
        ? `سلام! یہ نمبر VanSafe پر رجسٹرڈ نہیں ہے۔ اپنے بچے کی وین ٹریک کرنے کے لیے سائن اپ کریں: ${SIGNUP_URL}`
        : `Hi! This number isn't registered on VanSafe yet. Sign up to track your child's van: ${SIGNUP_URL}`);
    await saveTurn(admin, fromDigits, text, reply);
    return reply;
  }

  // --- Registered parent: assemble live data and let the assistant answer ---
  const { data: kidsData } = await admin
    .from("children")
    .select("*")
    .eq("parent_id", parent.id)
    .order("created_at");
  const children = (kidsData as Child[] | null) ?? [];
  const linked = children.filter((c) => c.driver_id);

  // Prefer a named child (fuzzy, so "Ayehsa" still matches); else all linked.
  const named = matchChildren(children, text).filter((c) => c.driver_id);
  const targets = named.length ? named : linked;
  const snaps = await Promise.all(targets.map((c) => snapshot(admin, c)));

  const context = await buildContext(admin, parent, children, snaps);
  const ai = await assistantReply(text, context, history);
  const reply = ai ?? (await deterministicFallback(text, snaps, linked, lang));

  await saveTurn(admin, fromDigits, text, reply);
  return reply;
}

// ---------------------------------------------------------------------------
// Conversation memory (very short, to keep token use low)
// ---------------------------------------------------------------------------

const HISTORY_TURNS = 4; // last ~2 exchanges sent to the model
const HISTORY_KEEP = 10; // rows retained per sender before pruning

/** Last few messages for a sender, oldest-first, as model messages. */
async function loadHistory(admin: Admin, sender: string): Promise<ChatMessage[]> {
  const { data } = await admin
    .from("bot_conversations")
    .select("role,content")
    .eq("sender", sender)
    .order("created_at", { ascending: false })
    .limit(HISTORY_TURNS);
  const rows = (data as { role: string; content: string }[] | null) ?? [];
  return rows
    .reverse()
    .map((r) => ({ role: r.role === "assistant" ? "assistant" : "user", content: r.content }));
}

/** Append this turn (user + assistant) and prune old rows for the sender. */
async function saveTurn(admin: Admin, sender: string, userText: string, reply: string): Promise<void> {
  await admin.from("bot_conversations").insert([
    { sender, role: "user", content: userText },
    { sender, role: "assistant", content: reply },
  ]);
  const { data: old } = await admin
    .from("bot_conversations")
    .select("id")
    .eq("sender", sender)
    .order("created_at", { ascending: false })
    .range(HISTORY_KEEP, 1000);
  const ids = ((old as { id: string }[] | null) ?? []).map((o) => o.id);
  if (ids.length) await admin.from("bot_conversations").delete().in("id", ids);
}

/** Lightweight language guess (no AI call) for fallback text only. */
function detectLang(text: string): "en" | "ur" {
  const t = text.toLowerCase();
  return /[؀-ۿ]/.test(text) ||
    /kahan|kidhar|wapas|salam|kaha|kitni|kab|kaisa|ghar|gari|nahi|hai|pohanch/.test(t)
    ? "ur"
    : "en";
}

// ---------------------------------------------------------------------------
// Bot helpers
// ---------------------------------------------------------------------------

/** Find the driver profile whose WhatsApp number matches the sender, else null. */
async function findDriver(admin: Admin, fromDigits: string): Promise<Profile | null> {
  const { data: drivers } = await admin.from("profiles").select("*").eq("role", "driver");
  return (
    (drivers as Profile[] | null)?.find((p) => {
      const d = digits(p.whatsapp);
      return d && (d === fromDigits || d.endsWith(fromDigits.slice(-9)) || fromDigits.endsWith(d.slice(-9)));
    }) ?? null
  );
}

/**
 * Everything the assistant may need to answer a driver: their Traccar setup
 * (server URL + device token), who's linked to their van (children + parents),
 * today's tracking status, and their vehicle/rating. Passed as JSON context.
 */
async function buildDriverContext(admin: Admin, driver: Profile) {
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: drvRow }, { data: kids }, { data: sess }, { data: pings }, { data: route }] =
    await Promise.all([
      admin.from("drivers").select("*").eq("id", driver.id).maybeSingle(),
      admin.from("children").select("name,school,parent_id").eq("driver_id", driver.id),
      admin.from("tracking_sessions").select("*").eq("driver_id", driver.id).maybeSingle(),
      admin
        .from("locations")
        .select("created_at")
        .eq("driver_id", driver.id)
        .order("created_at", { ascending: false })
        .limit(1),
      admin.from("routes").select("*").eq("driver_id", driver.id).maybeSingle(),
    ]);

  const drv = drvRow as Driver | null;
  const children = (kids as { name: string; school: string; parent_id: string }[] | null) ?? [];

  // Resolve parent names for the linked children.
  const parentIds = Array.from(new Set(children.map((c) => c.parent_id)));
  const { data: parentRows } = parentIds.length
    ? await admin.from("profiles").select("id,name").in("id", parentIds)
    : { data: [] };
  const parentName = new Map(
    ((parentRows as { id: string; name: string }[] | null) ?? []).map((p) => [p.id, p.name])
  );

  const token = drv?.track_token ?? null;
  const session = sess as TrackingSession | null;
  const lastPing = (pings as { created_at: string }[] | null)?.[0]?.created_at ?? null;
  const base = route as BaseRoute | null;

  return {
    driver: driver.name,
    tracking: {
      appUrl: TRACCAR_APP_URL,
      serverUrl: `${SITE_URL}/api/track`,
      deviceToken: token,
      tokenReady: Boolean(token),
      sharingToday: session?.last_ping_date === today,
      status: session?.status ?? "not started",
      pingsToday: session?.last_ping_date === today ? session?.pings_today ?? 0 : 0,
      lastPing: lastPing ? relativeTime(lastPing) : null,
    },
    passengers: children.map((c) => ({
      child: c.name,
      school: c.school,
      parent: parentName.get(c.parent_id) ?? "a parent",
    })),
    vehicle: drv ? drv.make_model || drv.vehicle_type : null,
    plate: drv?.plate ?? null,
    rating: drv?.rating ?? null,
    reviews: drv?.review_count ?? 0,
    seatsFree: drv ? Math.max(0, (drv.official_capacity || drv.capacity) - drv.occupancy) : null,
    verified: drv?.verified ?? false,
    route: {
      schoolName: base?.school_name ?? null,
      hasSchool: base?.school_lat != null,
      hasHome: base?.home_lat != null,
    },
  };
}

/** Deterministic Traccar setup text (fallback when the AI is unavailable). */
function traccarSetupText(name: string, token: string | null, lang: "en" | "ur"): string {
  const serverUrl = `${SITE_URL}/api/track`;
  if (!token) {
    return lang === "ur"
      ? `سلام ${name}! آپ کا ٹریکنگ ٹوکن ابھی تیار نہیں۔ براہ کرم ویب ایپ میں 'Route' صفحہ کھولیں۔`
      : `Hi ${name}! Your tracking token isn't set up yet. Open the Route page in the web app to generate it.`;
  }
  if (lang === "ur") {
    return (
      `🚐 سلام ${name}! بیک گراؤنڈ میں لوکیشن شیئر کرنے کے لیے Traccar Client ایپ استعمال کریں:\n\n` +
      `1. ایپ انسٹال کریں: ${TRACCAR_APP_URL}\n` +
      `2. Server URL: ${serverUrl}\n` +
      `3. Device identifier: ${token}\n` +
      `4. Distance = 0 اور Frequency ~60s رکھیں، پھر Service ON کر دیں۔\n\n` +
      `اس کے بعد آپ کی وین کی لوکیشن خود بخود اپڈیٹ ہوتی رہے گی۔`
    );
  }
  return (
    `🚐 Hi ${name}! Share your van's live location hands-free with the Traccar Client app:\n\n` +
    `1. Install: ${TRACCAR_APP_URL}\n` +
    `2. Server URL: ${serverUrl}\n` +
    `3. Device identifier: ${token}\n` +
    `4. Set Distance to 0 and Frequency to ~60s, then turn the Service ON.\n\n` +
    `Your van location then updates automatically in the background.`
  );
}

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

/**
 * Assemble everything the assistant may need to answer a parent: their children
 * and link status, plus per-van live location, ETA to school AND home, driver
 * details, and a few recent reviews. Passed to the model as JSON context.
 */
async function buildContext(
  admin: Admin,
  parent: Profile,
  children: Child[],
  snaps: Snapshot[]
) {
  const vans = await Promise.all(
    snaps.map(async (s) => {
      const d = s.driver;
      let place: string | null = null;
      let etaToSchoolMin: number | null = null;
      let etaToHomeMin: number | null = null;
      if (s.latest) {
        const here = { lat: s.latest.lat, lng: s.latest.lng };
        const [pl, school, home] = await Promise.all([
          reverseGeocode(s.latest.lat, s.latest.lng),
          s.base?.school_lat != null && s.base?.school_lng != null
            ? estimateEta(here, { lat: s.base.school_lat, lng: s.base.school_lng }, { traffic: true })
            : Promise.resolve(null),
          s.base?.home_lat != null && s.base?.home_lng != null
            ? estimateEta(here, { lat: s.base.home_lat, lng: s.base.home_lng }, { traffic: true })
            : Promise.resolve(null),
        ]);
        place = pl;
        if (school) etaToSchoolMin = Math.max(1, Math.round(school.durationTrafficS / 60));
        if (home) etaToHomeMin = Math.max(1, Math.round(home.durationTrafficS / 60));
      }

      const { data: reviewRows } = await admin
        .from("reviews")
        .select("rating,comment")
        .eq("driver_id", s.child.driver_id as string)
        .order("created_at", { ascending: false })
        .limit(3);
      const recentReviews = (reviewRows as Pick<Review, "rating" | "comment">[] | null) ?? [];

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
              recentReviews,
            }
          : null,
        location: s.latest
          ? {
              place,
              lastSeen: relativeTime(s.latest.created_at),
              mapsLink: googleMapsLink(s.latest.lat, s.latest.lng),
            }
          : null,
        etaToSchoolMin,
        etaToHomeMin,
      };
    })
  );

  return {
    parent: parent.name,
    children: children.map((c) => ({
      name: c.name,
      school: c.school,
      linkedToVan: Boolean(c.driver_id),
    })),
    vans,
  };
}

/**
 * Used only when the AI is unavailable (no key / call failed). Answers from the
 * live data with simple rules so the bot still replies usefully.
 */
async function deterministicFallback(
  text: string,
  snaps: Snapshot[],
  linked: Child[],
  lang: "en" | "ur"
): Promise<string> {
  if (!snaps.length) {
    if (!linked.length) {
      return lang === "ur"
        ? "آپ کے کسی بچے کی ابھی کوئی وین منتخب نہیں۔ ایپ میں جا کر وین منتخب کریں۔"
        : "None of your children are linked to a van yet. Open the app to choose a van.";
    }
    return lang === "ur"
      ? "میں وین کی لوکیشن، پہنچنے کا وقت، اور ڈرائیور کی تفصیلات بتا سکتا ہوں۔"
      : "I can share the van's live location, its ETA, and the driver's details. Just ask.";
  }

  const t = text.toLowerCase();
  if (/driver|rating|review|kaisa|profile|verified|kaun/.test(t))
    return (await Promise.all(snaps.map((s) => driverLine(s, lang)))).join("\n\n");
  if (/eta|how long|when will|kitni der|kitne|kab|reach|time|pohanch/.test(t)) {
    const wantsHome = /home|ghar|گھر|واپس|house|wapas/.test(t);
    return (await Promise.all(snaps.map((s) => etaLine(s, wantsHome, lang)))).join("\n\n");
  }
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
