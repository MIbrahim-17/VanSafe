import { handleIncoming, sendWhatsApp } from "@/lib/whatsapp";

/**
 * GET /api/whatsapp/webhook — Meta webhook verification handshake.
 * Set this URL + your Verify Token in Meta App Dashboard -> WhatsApp ->
 * Configuration -> Webhook. Meta calls this once with hub.challenge.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

/**
 * POST /api/whatsapp/webhook — inbound WhatsApp messages from Meta.
 * Unlike Twilio (TwiML), the reply is sent back via the Cloud API; we just
 * acknowledge with 200 so Meta doesn't retry.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];

    if (message?.type === "text") {
      const from: string = message.from; // E.164 digits, no '+'
      const text: string = message.text?.body ?? "";
      const reply = await handleIncoming(from, text);
      await sendWhatsApp(from, reply);
    }
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
  }

  // Always 200 — Meta retries aggressively on non-200 responses.
  return new Response("OK", { status: 200 });
}
