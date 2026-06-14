"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CITIES } from "@/lib/constants";
import ParentAreaSchoolPicker from "@/components/ParentAreaSchoolPicker";
import DriverAreaSchoolPicker from "@/components/DriverAreaSchoolPicker";
import VehiclePicker, { type VehicleValue, EMPTY_VEHICLE } from "@/components/VehiclePicker";
import LocationPicker from "@/components/LocationPicker";
import { User as RoleUser, Bus as RoleBus, Check } from "@/components/icons";
import type { Role } from "@/lib/types";

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("parent");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    whatsapp: "",
    city: "",
    // driver-only vehicle info
    plate: "",
    color: "",
    year: "",
  });
  const [vehicle, setVehicle] = useState<VehicleValue>(EMPTY_VEHICLE);
  // Area/school selections (separate from `form` because they're arrays/objects)
  const [parentArea, setParentArea] = useState("");
  const [parentSchool, setParentSchool] = useState("");
  const [childName, setChildName] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupLat, setPickupLat] = useState<number | null>(null);
  const [pickupLng, setPickupLng] = useState<number | null>(null);
  const [driverAreas, setDriverAreas] = useState<string[]>([]);
  const [driverSchools, setDriverSchools] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function finishProfile(supabase: ReturnType<typeof createClient>, userId: string) {
    if (role === "parent") {
      await supabase
        .from("profiles")
        .update({ area: parentArea, school: parentSchool })
        .eq("id", userId);
      // Create the parent's first child; more can be added from the dashboard.
      if (childName.trim()) {
        await supabase.from("children").insert({
          parent_id: userId,
          name: childName.trim(),
          school: parentSchool,
          pickup_address: pickupAddress,
          pickup_lat: pickupLat,
          pickup_lng: pickupLng,
        });
      }
    } else {
      await supabase
        .from("drivers")
        .update({
          areas: driverAreas,
          schools: driverSchools,
          area: driverAreas[0] ?? "",
        })
        .eq("id", userId);
    }
  }

  function update(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.city) {
      setError("Please select your city.");
      return;
    }
    // If a first child is being added, require a pinned pickup location.
    if (role === "parent" && childName.trim() && (pickupLat == null || pickupLng == null)) {
      setError("Pin your child's pickup location on the map (or clear the child's name to add them later).");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const supabase = createClient();

    const metadata: Record<string, string> = {
      role,
      name: form.name,
      whatsapp: form.whatsapp,
      city: form.city,
    };
    if (role === "driver") {
      Object.assign(metadata, {
        vehicle_type: vehicle.vehicle_type,
        vehicle_model: vehicle.vehicle_model,
        plate: form.plate,
        capacity: vehicle.capacity,
        official_capacity: vehicle.official_capacity || vehicle.capacity,
        make_model: vehicle.make_model,
        color: form.color,
        year: form.year,
      });
    }

    const { data, error: signErr } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: metadata },
    });

    if (signErr) {
      setError(signErr.message);
      setBusy(false);
      return;
    }

    if (data.session && data.user) {
      await finishProfile(supabase, data.user.id);
      router.push(role === "driver" ? "/driver/dashboard" : "/parent/dashboard");
      router.refresh();
      return;
    }

    const { data: signIn } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });
    if (signIn.session && signIn.user) {
      await finishProfile(supabase, signIn.user.id);
      setBusy(false);
      router.push(role === "driver" ? "/driver/dashboard" : "/parent/dashboard");
      router.refresh();
    } else {
      setBusy(false);
      setNotice("Account created! Please check your email to confirm, then log in.");
    }
  }

  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="text-title1 text-slate-900">Create your VanSafe account</h1>
      <p className="mt-1 text-sm text-slate-500">Choose how you&apos;ll use VanSafe.</p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {(["parent", "driver"] as Role[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={`card p-4 text-left transition-all duration-200 ease-apple active:scale-[0.98] ${
              role === r ? "ring-2 ring-brand-500" : "hover:bg-slate-50"
            }`}
          >
            <div
              className={`grid h-10 w-10 place-items-center rounded-xl ${
                role === r ? "bg-brand-700 text-white" : "bg-brand-50 text-brand-700"
              }`}
            >
              {r === "parent" ? <RoleUser size={20} /> : <RoleBus size={20} />}
            </div>
            <div className="mt-2 font-semibold capitalize text-slate-900">
              {r === "parent" ? "Parent" : "Van Driver"}
            </div>
            <div className="text-xs text-slate-500">
              {r === "parent" ? "Find & track a van" : "Offer rides & get found"}
            </div>
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-5 space-y-3">
        <div>
          <label className="label">Full name</label>
          <input className="input" required value={form.name} onChange={(e) => update("name", e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" required value={form.email} onChange={(e) => update("email", e.target.value)} />
        </div>
        <div>
          <label className="label">WhatsApp number</label>
          <input className="input" required placeholder="+92300…" value={form.whatsapp} onChange={(e) => update("whatsapp", e.target.value)} />
        </div>
        <div>
          <label className="label">City</label>
          <select className="input" required value={form.city} onChange={(e) => update("city", e.target.value)}>
            <option value="" disabled>
              Select your city…
            </option>
            {CITIES.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} — {c.urdu}
              </option>
            ))}
          </select>
        </div>

        {role === "parent" && form.city && (
          <div className="card space-y-2 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-700">Your first child</p>
            <div>
              <label className="label">Child&apos;s name</label>
              <input
                className="input"
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                placeholder="e.g. Ayesha"
              />
            </div>
            <p className="pt-1 text-xs text-slate-400">
              Add more children later from your dashboard.
            </p>
            <ParentAreaSchoolPicker
              city={form.city}
              area={parentArea}
              school={parentSchool}
              onChange={(a, s) => {
                setParentArea(a);
                setParentSchool(s);
              }}
            />
            {childName.trim() && (
              <div>
                <label className="label">Pickup location</label>
                <div className="flex gap-2">
                  <input
                    className="input"
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    placeholder="House, block, area"
                  />
                  <LocationPicker
                    value={{ lat: pickupLat, lng: pickupLng, address: pickupAddress }}
                    city={form.city}
                    title="Pin pickup location"
                    onChange={(v) => {
                      setPickupLat(v.lat);
                      setPickupLng(v.lng);
                      setPickupAddress(v.address);
                    }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {pickupLat != null ? (
                    <span className="text-emerald-600">
                      <Check size={12} /> Pickup pinned
                    </span>
                  ) : (
                    "Drop a pin so the driver can route to the exact spot."
                  )}
                </p>
              </div>
            )}
          </div>
        )}

        {role === "driver" && form.city && (
          <div className="card space-y-2 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-700">Areas &amp; schools you serve</p>
            <DriverAreaSchoolPicker
              city={form.city}
              areas={driverAreas}
              schools={driverSchools}
              onChange={(a, s) => {
                setDriverAreas(a);
                setDriverSchools(s);
              }}
            />
          </div>
        )}

        {role === "driver" && (
          <div className="card space-y-3 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-700">Your vehicle</p>
            <VehiclePicker value={vehicle} onChange={setVehicle} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Reg. plate</label>
                <input className="input" required placeholder="ABC-123" value={form.plate} onChange={(e) => update("plate", e.target.value)} />
              </div>
              <div>
                <label className="label">Colour</label>
                <input className="input" required placeholder="White" value={form.color} onChange={(e) => update("color", e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="label">Year <span className="text-slate-400">(optional)</span></label>
                <input className="input" type="number" min={1980} max={2030} placeholder="2018" value={form.year} onChange={(e) => update("year", e.target.value)} />
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="label">Password</label>
          <input className="input" type="password" required minLength={6} value={form.password} onChange={(e) => update("password", e.target.value)} />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {notice && <p className="text-sm text-emerald-600">{notice}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Creating…" : `Sign up as ${role === "parent" ? "Parent" : "Driver"}`}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-700">
          Log in
        </Link>
      </p>
    </div>
  );
}
