"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ChildForm, { type ChildValues } from "./ChildForm";
import { Plus } from "./icons";

const MAX_CHILDREN = 5;

export default function AddChild({ city, count }: { city: string; count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (count >= MAX_CHILDREN) {
    return (
      <p className="text-sm text-slate-400">
        You&apos;ve reached the limit of {MAX_CHILDREN} children per account.
      </p>
    );
  }

  async function add(values: ChildValues) {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error: err } = await supabase.from("children").insert({
      parent_id: user.id,
      name: values.name,
      school: values.school,
      pickup_address: values.pickup_address,
    });
    setBusy(false);
    if (err) {
      setError(
        err.message.includes("at most 5")
          ? `You can add up to ${MAX_CHILDREN} children.`
          : err.message
      );
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary">
        <Plus size={16} /> Add Child — بچہ شامل کریں
      </button>
    );
  }

  return (
    <div className="card p-4">
      <h3 className="mb-3 font-semibold text-slate-900">Add a child</h3>
      <ChildForm
        city={city}
        submitLabel="Add child"
        busy={busy}
        error={error}
        onSubmit={add}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}
