import type { DriverWithProfile, MatchResult, Review } from "@/lib/types";

/**
 * AI calls go through OpenRouter's OpenAI-compatible chat API, using Gemini 2.5
 * Flash by default. Every feature degrades to a deterministic rule-based
 * fallback when no API key is set or a call fails, so the app always works
 * offline. Override the model with OPENROUTER_MODEL if needed.
 */
const MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://van-safe.vercel.app";

/** OpenRouter key, accepting either spelling of the env var. */
function apiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Gemini 2.5 Flash over OpenRouter has variable tail latency (occasionally
// 15s+). 14s stays under Twilio's ~15s webhook limit while catching all but the
// rare extreme; those fall back to deterministic text.
const CHAT_TIMEOUT_MS = 14000;

/** Send a full message list (system + history + user) to the model. */
async function chatMessages(
  messages: ChatMessage[],
  opts: { temperature?: number } = {}
): Promise<string | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        // Optional attribution headers OpenRouter recommends.
        "HTTP-Referer": SITE,
        "X-Title": "VanSafe",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: opts.temperature ?? 0.3,
        // Prefer the fastest available provider to cut tail latency.
        provider: { sort: "latency" },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch {
    return null;
  }
}

/** Send a single prompt to the model; returns the text, or null on any failure. */
async function chat(prompt: string): Promise<string | null> {
  return chatMessages([{ role: "user", content: prompt }]);
}

/** Pull the first JSON value out of a model response (handles ```json fences). */
function parseJson<T>(text: string): T | null {
  try {
    const cleaned = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const start = cleaned.search(/[[{]/);
    if (start === -1) return null;
    return JSON.parse(cleaned.slice(start)) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1. Parent <-> van matching
// ---------------------------------------------------------------------------

export interface MatchCriteria {
  school: string;
  area: string;
  children: number;
}

export async function rankDrivers(
  criteria: MatchCriteria,
  drivers: DriverWithProfile[]
): Promise<MatchResult[]> {
  if (drivers.length) {
    const prompt = `You are VanSafe's matching assistant for school van drivers in Pakistan.
A parent needs a van. Their request:
- School: ${criteria.school || "any"}
- Area: ${criteria.area || "any"}
- Children needing seats: ${criteria.children}

Candidate drivers (JSON):
${JSON.stringify(
  drivers.map((d) => ({
    id: d.id,
    name: d.profile.name,
    city: d.profile.city,
    areas: d.areas,
    schools: d.schools,
    vehicle: d.make_model || d.vehicle_type,
    category: d.vehicle_type,
    rating: d.rating,
    reviews: d.review_count,
    seatsFree: Math.max(0, (d.official_capacity || d.capacity) - d.occupancy),
    verified: d.verified,
  }))
)}

Rank ALL candidates from best to worst for this parent. Reward school + area match,
enough free seats for the children, higher rating, and verification.
Return ONLY a JSON array: [{"driverId":"<id>","score":<0-100 integer>,"reason":"<one short sentence>"}].`;

    const text = await chat(prompt);
    if (text) {
      const parsed = parseJson<MatchResult[]>(text);
      if (Array.isArray(parsed) && parsed.length) {
        const valid = parsed.filter((m) => drivers.some((d) => d.id === m.driverId));
        if (valid.length) return valid.sort((a, b) => b.score - a.score);
      }
    }
  }
  return ruleRank(criteria, drivers);
}

function ruleRank(criteria: MatchCriteria, drivers: DriverWithProfile[]): MatchResult[] {
  const school = criteria.school.trim().toLowerCase();
  const area = criteria.area.trim().toLowerCase();

  return drivers
    .map((d) => {
      let score = 40;
      const reasons: string[] = [];
      const seatsFree = Math.max(0, (d.official_capacity || d.capacity) - d.occupancy);

      if (school && d.schools.some((s) => s.toLowerCase().includes(school))) {
        score += 25;
        reasons.push("serves your school");
      }
      if (area && d.areas.some((a) => a.toLowerCase().includes(area))) {
        score += 15;
        reasons.push("covers your area");
      }
      if (seatsFree >= criteria.children) {
        score += 10;
        reasons.push(`${seatsFree} seats free`);
      } else {
        score -= 20;
        reasons.push("limited seats");
      }
      score += Math.round(d.rating * 2);
      if (d.verified) {
        score += 5;
        reasons.push("verified");
      }
      score = Math.max(0, Math.min(100, score));
      const reason = reasons.length
        ? capitalise(reasons.join(", ")) + "."
        : `Rated ${d.rating}/5 with ${seatsFree} seats free.`;
      return { driverId: d.id, score, reason };
    })
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// 2. Review summary
// ---------------------------------------------------------------------------

export async function summarizeReviews(
  reviews: Pick<Review, "rating" | "comment">[]
): Promise<string> {
  if (reviews.length === 0) return "No reviews yet — be the first to share your experience.";

  const prompt = `Summarise these parent reviews of a school van driver into 2 short,
balanced sentences a busy parent can read in seconds. Mention recurring themes
(punctuality, safety, comfort). Do not invent facts.
Reviews:
${reviews.map((r) => `- ${r.rating}/5: ${r.comment}`).join("\n")}
Return only the summary text.`;
  const summary = await chat(prompt);
  if (summary) return summary;

  const avg = (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1);
  return `Parents rate this driver ${avg}/5 across ${reviews.length} review${
    reviews.length === 1 ? "" : "s"
  }. ${reviews[0].comment}`;
}

// ---------------------------------------------------------------------------
// 3. Anomaly explanation (English / Urdu)
// ---------------------------------------------------------------------------

export async function explainAnomaly(
  type: "stationary" | "route_deviation",
  details: string,
  lang: "en" | "ur" = "en"
): Promise<string> {
  const prompt = `Write ONE short, calm, plain-language WhatsApp alert (max 30 words) for a
parent about their child's school van. Language: ${lang === "ur" ? "Urdu" : "English"}.
Situation: ${type === "stationary" ? "the van has been stationary too long" : "the van seems to be taking an unusual route"}.
Details: ${details}. No jargon. Return only the message.`;
  const text = await chat(prompt);
  if (text) return text;

  if (type === "stationary") {
    return lang === "ur"
      ? "آپ کے بچے کی وین کافی دیر سے ایک جگہ رکی ہوئی ہے۔ براہ کرم ڈرائیور سے رابطہ کریں۔"
      : `Your child's van has been stopped for a while (${details}). You may want to check in with the driver.`;
  }
  return lang === "ur"
    ? "وین معمول سے مختلف راستے پر جا رہی ہے۔ براہ کرم تصدیق کر لیں۔"
    : `Your child's van appears to be on an unusual route (${details}). Please verify with the driver.`;
}

// ---------------------------------------------------------------------------
// 4. WhatsApp natural-language intent (EN / Urdu / mixed)
// ---------------------------------------------------------------------------

export type WaIntent =
  | "where"
  | "status"
  | "eta"
  | "driver_info"
  | "help"
  | "greeting"
  | "unknown";

export async function interpretWhatsApp(
  text: string
): Promise<{ intent: WaIntent; lang: "en" | "ur" }> {
  const prompt = `Classify this WhatsApp message from a parent to a school-van tracking bot.
Message: "${text}"
Return ONLY JSON: {"intent":"where|status|eta|driver_info|help|greeting|unknown","lang":"en|ur"}.
"where" = asking the van's current location. "status" = asking if it's moving/stopped.
"eta" = asking how long / when the van will reach school or home (time to arrive).
"driver_info" = asking about the driver: who they are, vehicle, rating, reviews, summary.
"help" = how to use / sign up. "greeting" = hi/salam. Detect Urdu (incl. roman Urdu) vs English.`;
  const reply = await chat(prompt);
  if (reply) {
    const parsed = parseJson<{ intent: WaIntent; lang: "en" | "ur" }>(reply);
    if (parsed?.intent) return parsed;
  }
  return ruleIntent(text);
}

/**
 * Free-form answer for questions the fixed intents don't cover. Answers ONLY
 * from the provided context (the parent's children, drivers, live locations,
 * ETAs). Returns null when OpenRouter isn't configured or the call fails, so the
 * caller can fall back to a deterministic reply.
 */
export async function answerBotQuestion(
  question: string,
  context: unknown,
  lang: "en" | "ur"
): Promise<string | null> {
  const prompt = `You are VanSafe's helpful assistant for a parent tracking their child's school van.
Answer the parent's question using ONLY the data below. Be concise (1-3 short sentences),
warm, and reply in ${lang === "ur" ? "Urdu" : "English"}. Include a Google Maps link if one is
relevant to the answer. If the data does not contain the answer, say you don't have that detail
and mention what you can help with: live location, ETA to school/home, and driver details.
Do not invent facts.

Parent's question: "${question}"

Data (JSON):
${JSON.stringify(context)}

Reply with only the message text.`;
  return chat(prompt);
}

function ruleIntent(text: string): { intent: WaIntent; lang: "en" | "ur" } {
  const t = text.toLowerCase();
  const lang: "en" | "ur" =
    /[؀-ۿ]/.test(text) || /kahan|kidhar|wapas|salam|kaha|kitni|kab|kaisa/.test(t) ? "ur" : "en";
  // ETA before status, since "when will it reach" mentions "reach".
  if (/\beta\b|how long|how much time|when will|kitni der|kitne? min|kab (tak |)(pohanch|aye|aa)|time to (reach|school|home)/.test(t))
    return { intent: "eta", lang };
  if (/driver|about the van|rating|review|kaisa hai|kaisa driver|summary|profile|verified|kaun/.test(t))
    return { intent: "driver_info", lang };
  if (/where|kahan|kidhar|location|van\s*kaha|track/.test(t)) return { intent: "where", lang };
  if (/status|moving|arrive|pohanch|chal|reach/.test(t)) return { intent: "status", lang };
  if (/help|sign\s*up|register|kaise|how/.test(t)) return { intent: "help", lang };
  if (/^(hi|hello|hey|salam|assalam|aoa)/.test(t)) return { intent: "greeting", lang };
  return { intent: "unknown", lang };
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// 5. Conversational assistant (WhatsApp + in-app simulator)
// ---------------------------------------------------------------------------

const ASSISTANT_SYSTEM = `You are VanSafe's assistant on WhatsApp, chatting with a REGISTERED parent in Pakistan.
VanSafe lets parents track their child's school van live, get safety alerts (departed/arrived, unusual route, traffic delays), and pick verified, parent-reviewed drivers.

Your job:
- Answer the parent's questions about their child's van using ONLY the live data provided below (current location, ETA to school/home, driver details, ratings, recent reviews).
- When asked, guide them on how to use VanSafe: tracking the van, understanding alerts, choosing or reviewing a driver, marking a child absent.

Rules:
- Be warm and concise — 1 to 4 short sentences per child. This is WhatsApp, never an essay.
- Reply in the SAME language the parent used: English, Urdu, or roman Urdu.
- NEVER ask the parent which child they mean. If they didn't name a child and the data has more than one, answer for EVERY child in the data (one short labelled line each). The data already contains only the relevant children.
- If a child in the data isn't linked to a van, say so briefly for that child.
- When the answer is about where the van is, include the Google Maps link from the data.
- Never invent facts or numbers. If the data does not contain the answer, say so plainly and mention what you can help with: live location, ETA to school/home, and driver details.`;

/** Compose a reply for a registered parent over their live van data + short history. */
export async function assistantReply(
  question: string,
  context: unknown,
  history: ChatMessage[]
): Promise<string | null> {
  const messages: ChatMessage[] = [
    { role: "system", content: ASSISTANT_SYSTEM },
    { role: "system", content: `Live data (JSON):\n${JSON.stringify(context)}` },
    ...history,
    { role: "user", content: question },
  ];
  return chatMessages(messages);
}

const ONBOARDING_SYSTEM = `You are VanSafe's assistant on WhatsApp, talking to someone whose number is NOT registered on VanSafe yet.
VanSafe is a school-van safety platform for parents in Pakistan: track your child's van live on a map, get automatic departed/arrived and safety alerts, and pick verified, parent-reviewed drivers.

Your ONLY job is onboarding:
- Explain briefly how to get started: sign up at ${SITE}/register, add your child, then choose a van.
- When asked, explain how VanSafe works and why to use it (live tracking, automatic safety alerts, verified drivers, peace of mind).

Rules:
- Be warm and concise — 1 to 4 short sentences. WhatsApp style.
- Reply in the SAME language used: English, Urdu, or roman Urdu.
- Make signing up easy: include the link ${SITE}/register when relevant.
- Stay strictly on VanSafe onboarding. If asked anything off-topic, politely say you can only help with getting started on VanSafe, and steer back to signing up.`;

/** Compose an onboarding reply for an unregistered sender + short history. */
export async function onboardingReply(
  question: string,
  history: ChatMessage[]
): Promise<string | null> {
  const messages: ChatMessage[] = [
    { role: "system", content: ONBOARDING_SYSTEM },
    ...history,
    { role: "user", content: question },
  ];
  return chatMessages(messages);
}

const DRIVER_SYSTEM = `You are VanSafe's assistant on WhatsApp, chatting with a registered VAN DRIVER in Pakistan.
VanSafe lets drivers share their van's live location hands-free (via the Traccar Client app), run optimized routes, and build trust with parents through ratings and reviews.

Your job:
- Help the driver share their van's location. When they ask how to start/share tracking, give the Traccar Client setup using the EXACT serverUrl and deviceToken from the data: install the Traccar Client app (ALWAYS include BOTH links — Android: androidUrl, iPhone/iOS: iosUrl), set Server URL = serverUrl, Device identifier = deviceToken, set Distance to 0 and Frequency to ~60s, then turn the Service ON. If tokenReady is false, tell them to open the Route page in the web app to generate their token.
- Answer using ONLY the data: who is linked to their van (children + their parents), their rating and reviews, their vehicle, and whether their van is currently sending location today (tracking).
- Guide them on using VanSafe as a driver: route optimization, regenerating their tracking token, marking trips.

Rules:
- Warm and concise — 1 to 4 short sentences, or a short numbered list for setup steps. WhatsApp style.
- Reply in the SAME language the driver used: English, Urdu, or roman Urdu.
- The deviceToken is the driver's OWN credential — it is fine to share it with them when relevant.
- Never invent facts. If the data does not contain the answer, say so and mention what you can help with: sharing location, who is linked to their van, their rating, and route tips.`;

/** Compose a reply for a registered driver over their VanSafe data + short history. */
export async function driverAssistantReply(
  question: string,
  context: unknown,
  history: ChatMessage[]
): Promise<string | null> {
  const messages: ChatMessage[] = [
    { role: "system", content: DRIVER_SYSTEM },
    { role: "system", content: `Driver data (JSON):\n${JSON.stringify(context)}` },
    ...history,
    { role: "user", content: question },
  ];
  return chatMessages(messages);
}
