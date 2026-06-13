import { NextResponse } from "next/server";
import { handleIncoming } from "@/lib/whatsapp";

/** POST /api/whatsapp/simulate {from,text} -> bot reply (in-app simulator). */
export async function POST(req: Request) {
  const { from, text } = await req.json();
  if (!from || !text) {
    return NextResponse.json({ error: "from and text required" }, { status: 400 });
  }
  const reply = await handleIncoming(from, text);
  return NextResponse.json({ reply });
}
