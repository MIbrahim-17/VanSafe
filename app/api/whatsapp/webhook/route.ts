import { handleIncoming, verifyTwilioSignature } from "@/lib/whatsapp";

/**
 * POST /api/whatsapp/webhook — Twilio WhatsApp inbound webhook.
 * In the Twilio Console (WhatsApp sandbox or a number), set "When a message
 * comes in" to this URL. Twilio sends form-encoded fields (From, Body); we reply
 * with TwiML so the bot's answer is delivered back to the sender.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    params[k] = String(v);
  });

  // Reconstruct the public URL Twilio signed (override via TWILIO_WEBHOOK_URL).
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const reqUrl = new URL(req.url);
  const url =
    process.env.TWILIO_WEBHOOK_URL ?? `${proto}://${host}${reqUrl.pathname}${reqUrl.search}`;

  const signature = req.headers.get("x-twilio-signature");
  if (!verifyTwilioSignature(url, params, signature)) {
    console.warn("Rejected webhook: invalid Twilio signature. Reconstructed URL:", url);
    return new Response("Invalid signature", { status: 403 });
  }

  const from = params.From ?? ""; // e.g. "whatsapp:+923001112233"
  const body = params.Body ?? "";

  const reply = await handleIncoming(from, body);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(
    reply
  )}</Message></Response>`;

  return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
