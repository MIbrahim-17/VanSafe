"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { data, error: signErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    if (signErr) {
      setError(signErr.message);
      return;
    }
    const role = (data.user?.user_metadata?.role as string) ?? "parent";
    router.push(role === "driver" ? "/driver/dashboard" : "/parent/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md py-12">
      <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
      <p className="mt-1 text-sm text-slate-500">Log in to your VanSafe account.</p>

      <form onSubmit={submit} className="mt-6 space-y-3">
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>

      <div className="mt-4 rounded-xl bg-slate-100 p-3 text-xs text-slate-500">
        <p className="font-medium text-slate-600">Demo accounts (password: password123)</p>
        <p>Parent: sara.parent@vansafe.test</p>
        <p>Driver: imran.driver@vansafe.test</p>
      </div>

      <p className="mt-4 text-center text-sm text-slate-500">
        New to VanSafe?{" "}
        <Link href="/register" className="font-medium text-brand-700">
          Create an account
        </Link>
      </p>
    </div>
  );
}
