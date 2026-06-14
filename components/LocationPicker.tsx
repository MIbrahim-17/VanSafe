"use client";

/**
 * LocationPicker — a "pin on map" button that opens a map dialog (like food
 * delivery apps). Search an address or use current location to drop the pin,
 * drag it to fine-tune (reverse-geocodes the address), then Confirm. A pin is
 * required: Confirm is disabled until a point is set.
 */
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { MapPin, Check, X } from "./icons";
import { searchPlaces, reverseClient, type PlaceHit } from "@/lib/geocodeClient";
import { cityCenter } from "@/lib/constants";

const PickMap = dynamic(() => import("./LocationPickerMap"), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-lg bg-slate-100" />,
});

export interface LocationValue {
  lat: number | null;
  lng: number | null;
  address: string;
}

export default function LocationPicker({
  value,
  city,
  title = "Set location",
  onChange,
}: {
  value: LocationValue;
  city?: string;
  title?: string;
  onChange: (v: { lat: number; lng: number; address: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [lat, setLat] = useState<number | null>(value.lat);
  const [lng, setLng] = useState<number | null>(value.lng);
  const [address, setAddress] = useState(value.address);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openPicker() {
    setLat(value.lat);
    setLng(value.lng);
    setAddress(value.address);
    setQuery("");
    setHits([]);
    setOpen(true);
  }

  // Debounced address search while the dialog is open.
  useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 3) {
      setHits([]);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      setHits(await searchPlaces(query, city));
      setSearching(false);
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, open, city]);

  async function pick(la: number, ln: number, addr?: string) {
    setLat(la);
    setLng(ln);
    if (addr !== undefined) {
      setAddress(addr);
    } else {
      const rev = await reverseClient(la, ln);
      if (rev) setAddress(rev);
    }
  }

  function chooseHit(h: PlaceHit) {
    setHits([]);
    setQuery("");
    pick(h.lat, h.lng, h.label.split(",").slice(0, 4).join(",").trim());
  }

  function useCurrent() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await pick(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  function confirm() {
    if (lat == null || lng == null) return;
    onChange({ lat, lng, address });
    setOpen(false);
  }

  const center = lat != null && lng != null ? { lat, lng } : cityCenter(city);
  const pinned = value.lat != null && value.lng != null;

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className={`btn-ghost ${pinned ? "border-emerald-300 text-emerald-700" : ""}`}
      >
        {pinned ? (
          <>
            <Check size={15} /> Pinned · edit
          </>
        ) : (
          <>
            <MapPin size={15} /> Pin on map
          </>
        )}
      </button>

      {open && (
        <div
          className="animate-overlay fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="animate-sheet max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-black/[0.06] bg-white p-4 pb-6 shadow-pop sm:rounded-[22px] sm:pb-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grabber (mobile sheet affordance) */}
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-title3 text-slate-900">{title}</h3>
              <button
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="relative">
              <input
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search address or area…"
              />
              {hits.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-44 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {hits.map((h, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => chooseHit(h)}
                        className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                      >
                        {h.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-2 flex items-center justify-between">
              <button type="button" onClick={useCurrent} className="btn-ghost text-xs">
                <MapPin size={14} /> {locating ? "Locating…" : "Use my current location"}
              </button>
              {searching && <span className="text-xs text-slate-400">Searching…</span>}
            </div>

            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
              <PickMap
                center={center}
                marker={lat != null && lng != null ? { lat, lng } : null}
                onPick={(la, ln) => pick(la, ln)}
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Tap the map or drag the pin to set the exact spot.
            </p>

            <div className="mt-3">
              <label className="label">Address</label>
              <input
                className="input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="House, block, area"
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={confirm}
                disabled={lat == null}
                className="btn-primary flex-1"
              >
                {lat == null ? "Drop a pin to confirm" : "Confirm location"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
