import { GoogleGenerativeAI } from "@google/generative-ai";
import type { DriverWithProfile, MatchResult, Review } from "@/lib/types";

const MODEL = "gemini-2.0-flash";

function getModel() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenerativeAI(key).getGenerativeModel({ model: MODEL });
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
  const model = getModel();
  if (model && drivers.length) {
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
    area: d.area,
    schools: d.schools,
    vehicle: d.vehicle_type,
    rating: d.rating,
    reviews: d.review_count,
    seatsFree: Math.max(0, d.capacity - d.occupancy),
    verified: d.verified,
  }))
)}

Rank ALL candidates from best to worst for this parent. Reward school + area match,
enough free seats for the children, higher rating, and verification.
Return ONLY a JSON array: [{"driverId":"<id>","score":<0-100 integer>,"reason":"<one short sentence>"}].`;

    try {
      const res = await model.generateContent(prompt);
      const parsed = parseJson<MatchResult[]>(res.response.text());
      if (Array.isArray(parsed) && parsed.length) {
        const valid = parsed.filter((m) => drivers.some((d) => d.id === m.driverId));
        if (valid.length) return valid.sort((a, b) => b.score - a.score);
      }
    } catch {
      // fall through to rule-based
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
      const seatsFree = Math.max(0, d.capacity - d.occupancy);

      if (school && d.schools.some((s) => s.toLowerCase().includes(school))) {
        score += 25;
        reasons.push("serves your school");
      }
      if (area && d.area.toLowerCase().includes(area)) {
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

  const model = getModel();
  if (model) {
    const prompt = `Summarise these parent reviews of a school van driver into 2 short,
balanced sentences a busy parent can read in seconds. Mention recurring themes
(punctuality, safety, comfort). Do not invent facts.
Reviews:
${reviews.map((r) => `- ${r.rating}/5: ${r.comment}`).join("\n")}
Return only the summary text.`;
    try {
      const res = await model.generateContent(prompt);
      const text = res.response.text().trim();
      if (text) return text;
    } catch {
      // fall through
    }
  }

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
  const model = getModel();
  if (model) {
    const prompt = `Write ONE short, calm, plain-language WhatsApp alert (max 30 words) for a
parent about their child's school van. Language: ${lang === "ur" ? "Urdu" : "English"}.
Situation: ${type === "stationary" ? "the van has been stationary too long" : "the van seems to be taking an unusual route"}.
Details: ${details}. No jargon. Return only the message.`;
    try {
      const res = await model.generateContent(prompt);
      const text = res.response.text().trim();
      if (text) return text;
    } catch {
      // fall through
    }
  }

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

export type WaIntent = "where" | "status" | "help" | "greeting" | "unknown";

export async function interpretWhatsApp(
  text: string
): Promise<{ intent: WaIntent; lang: "en" | "ur" }> {
  const model = getModel();
  if (model) {
    const prompt = `Classify this WhatsApp message from a parent to a school-van tracking bot.
Message: "${text}"
Return ONLY JSON: {"intent":"where|status|help|greeting|unknown","lang":"en|ur"}.
"where" = asking the van's location. "status" = asking if it's moving/arrived.
"help" = how to use / sign up. "greeting" = hi/salam. Detect Urdu (incl. roman Urdu) vs English.`;
    try {
      const res = await model.generateContent(prompt);
      const parsed = parseJson<{ intent: WaIntent; lang: "en" | "ur" }>(res.response.text());
      if (parsed?.intent) return parsed;
    } catch {
      // fall through
    }
  }
  return ruleIntent(text);
}

function ruleIntent(text: string): { intent: WaIntent; lang: "en" | "ur" } {
  const t = text.toLowerCase();
  const lang: "en" | "ur" =
    /[؀-ۿ]/.test(text) || /kahan|kidhar|wapas|salam|kaha/.test(t) ? "ur" : "en";
  if (/where|kahan|kidhar|location|van\s*kaha|track/.test(t)) return { intent: "where", lang };
  if (/status|moving|arrive|pohanch|chal|reach/.test(t)) return { intent: "status", lang };
  if (/help|sign\s*up|register|kaise|how/.test(t)) return { intent: "help", lang };
  if (/^(hi|hello|hey|salam|assalam|aoa)/.test(t)) return { intent: "greeting", lang };
  return { intent: "unknown", lang };
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
