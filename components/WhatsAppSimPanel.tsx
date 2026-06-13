"use client";

import { useRef, useState } from "react";
import { Bus } from "./icons";

interface Msg {
  from: "user" | "bot";
  text: string;
}

const QUICK = ["Where is the van?", "وین کہاں ہے؟", "Is the van moving?", "How do I sign up?"];

export default function WhatsAppSimPanel({ whatsapp }: { whatsapp: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    { from: "bot", text: "As-salamu alaikum! Ask me where your child's van is — in English or Urdu." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setMsgs((m) => [...m, { from: "user", text }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/whatsapp/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: whatsapp, text }),
      });
      const j = await res.json();
      setMsgs((m) => [...m, { from: "bot", text: j.reply ?? "…" }]);
    } catch {
      setMsgs((m) => [...m, { from: "bot", text: "Network error. Try again." }]);
    } finally {
      setBusy(false);
      setTimeout(() => boxRef.current?.scrollTo(0, boxRef.current.scrollHeight), 50);
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 bg-[#075E54] px-4 py-3 text-white">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-white/20"><Bus size={18} /></span>
        <div>
          <p className="text-sm font-semibold leading-tight">VanSafe Bot</p>
          <p className="text-xs text-white/70">WhatsApp simulator</p>
        </div>
      </div>

      <div
        ref={boxRef}
        className="h-72 space-y-2 overflow-y-auto bg-[#ECE5DD] p-3"
      >
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`max-w-[80%] whitespace-pre-line rounded-lg px-3 py-2 text-sm shadow-sm ${
              m.from === "user"
                ? "ml-auto bg-[#DCF8C6] text-slate-800"
                : "bg-white text-slate-800"
            }`}
          >
            {m.text}
          </div>
        ))}
        {busy && <div className="text-xs text-slate-500">VanSafe Bot is typing…</div>}
      </div>

      <div className="space-y-2 border-t border-slate-200 p-3">
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              {q}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2"
        >
          <input
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
          />
          <button className="btn-primary" disabled={busy}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
