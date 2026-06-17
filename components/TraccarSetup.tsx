"use client";

/**
 * Driver setup card for hands-free background location sharing via the Traccar
 * Client app (no login, runs in the background). The driver enters the server
 * URL + their token once and toggles the service on.
 */
import { useEffect, useState } from "react";
import { MapPin, Check, Reset } from "@/components/icons";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex gap-2">
        <input className="input font-mono text-sm" value={value} readOnly />
        <button type="button" onClick={copy} className="btn-ghost shrink-0 text-xs">
          {copied ? (
            <>
              <Check size={14} /> Copied
            </>
          ) : (
            "Copy"
          )}
        </button>
      </div>
    </div>
  );
}

export default function TraccarSetup({ initialToken }: { initialToken: string | null }) {
  const [token, setToken] = useState(initialToken ?? "");
  const [serverUrl, setServerUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setServerUrl(`${window.location.origin}/api/track`);
  }, []);

  async function regenerate() {
    if (!confirm("Generate a new token? The old one will stop working until you update Traccar Client.")) return;
    setBusy(true);
    const res = await fetch("/api/track/regenerate", { method: "POST" });
    setBusy(false);
    if (res.ok) {
      const j = await res.json();
      if (j.token) setToken(j.token);
    }
  }

  return (
    <div className="card space-y-4 p-4">
      <div>
        <h2 className="text-title3 flex items-center gap-2 text-slate-900">
          <MapPin size={18} className="text-brand-700" /> Background location (Traccar)
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Share your location hands-free without keeping the app open. Set this up once;
          it runs in the background and updates the parents&apos; map automatically.
        </p>
      </div>

      <ol className="space-y-3 text-sm text-slate-700">
        <li className="flex gap-2">
          <Step n={1} />
          <span>
            Install the free{" "}
            <a
              className="font-medium text-brand-700 hover:underline"
              href="https://play.google.com/store/apps/details?id=org.traccar.client"
              target="_blank"
              rel="noreferrer"
            >
              Traccar Client
            </a>{" "}
            app (Android / iOS).
          </span>
        </li>
        <li className="flex gap-2">
          <Step n={2} />
          <span>In its settings, paste these two values:</span>
        </li>
      </ol>

      <div className="space-y-3 rounded-xl bg-slate-50 p-3">
        <CopyField label="Server URL" value={serverUrl} />
        <CopyField label="Device identifier" value={token} />
      </div>

      <ol className="space-y-3 text-sm text-slate-700" start={3}>
        <li className="flex gap-2">
          <Step n={3} />
          <span>Set <b>Frequency</b> to ~30 seconds and turn <b>Service status</b> ON.</span>
        </li>
        <li className="flex gap-2">
          <Step n={4} />
          <span>That&apos;s it — your van location now updates in the background.</span>
        </li>
      </ol>

      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
        <p className="text-xs text-slate-400">
          Keep this identifier private — it&apos;s what links pings to your van.
        </p>
        <button onClick={regenerate} disabled={busy} className="btn-ghost text-xs">
          <Reset size={13} /> {busy ? "Generating…" : "Regenerate"}
        </button>
      </div>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
      {n}
    </span>
  );
}
