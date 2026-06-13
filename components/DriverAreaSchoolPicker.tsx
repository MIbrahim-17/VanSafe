"use client";

import { useEffect, useRef, useState } from "react";
import { useSchoolCatalog } from "@/lib/useSchoolCatalog";
import { X } from "./icons";

interface Block {
  id: number;
  area: string;
  schools: string[];
}

/**
 * Multi-area, multi-school selector for van drivers. Each block is one area with
 * its own school list; drivers can add/remove area blocks. Emits flat
 * areas[]/schools[] via onChange. Catalog cities (Lahore/Karachi) use dropdowns
 * + checkboxes with a manual "other school" fallback; other cities use free text.
 */
export default function DriverAreaSchoolPicker({
  city,
  areas,
  schools,
  onChange,
}: {
  city: string;
  areas: string[];
  schools: string[];
  onChange: (areas: string[], schools: string[]) => void;
}) {
  const cat = useSchoolCatalog(city);
  const catalog = cat.hasCatalog;
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [customSchool, setCustomSchool] = useState<Record<number, string>>({});
  const nextId = useRef(1);

  // Rebuild blocks whenever the city changes (areas differ per city).
  useEffect(() => {
    if (areas.length) {
      setBlocks(
        areas.map((a) => ({
          id: nextId.current++,
          area: a,
          schools: schools.filter((s) =>
            catalog ? cat.getSchools(a).includes(s) || cat.areaOfSchool(s) === a : true
          ),
        }))
      );
    } else {
      setBlocks([{ id: nextId.current++, area: "", schools: [] }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  function commit(next: Block[]) {
    setBlocks(next);
    const a = Array.from(new Set(next.map((b) => b.area.trim()).filter(Boolean)));
    const s = Array.from(new Set(next.flatMap((b) => b.schools).filter(Boolean)));
    onChange(a, s);
  }

  function update(id: number, patch: Partial<Block>) {
    commit(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function toggleSchool(id: number, school: string) {
    const b = blocks.find((x) => x.id === id)!;
    const has = b.schools.includes(school);
    update(id, {
      schools: has ? b.schools.filter((s) => s !== school) : [...b.schools, school],
    });
  }

  function addCustomSchool(id: number) {
    const val = (customSchool[id] ?? "").trim();
    if (!val) return;
    const b = blocks.find((x) => x.id === id)!;
    if (!b.schools.includes(val)) update(id, { schools: [...b.schools, val] });
    setCustomSchool((m) => ({ ...m, [id]: "" }));
  }

  function addBlock() {
    commit([...blocks, { id: nextId.current++, area: "", schools: [] }]);
  }

  function removeBlock(id: number) {
    commit(blocks.filter((b) => b.id !== id));
  }

  return (
    <div className="space-y-3">
      {blocks.map((b) => (
        <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex-1">
              <label className="label">Area</label>
              {catalog ? (
                <select
                  className="input"
                  value={b.area}
                  onChange={(e) => update(b.id, { area: e.target.value, schools: [] })}
                >
                  <option value="">Select area…</option>
                  {cat.getAreas().map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="input"
                  value={b.area}
                  onChange={(e) => update(b.id, { area: e.target.value })}
                  placeholder="Area / neighbourhood"
                />
              )}
            </div>
            {blocks.length > 1 && (
              <button
                type="button"
                onClick={() => removeBlock(b.id)}
                className="mt-5 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                aria-label="Remove area"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {b.area && (
            <div>
              <label className="label">Schools in {b.area}</label>
              {catalog ? (
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {cat.getSchools(b.area).map((s) => (
                    <label key={s} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={b.schools.includes(s)}
                        onChange={() => toggleSchool(b.id, s)}
                      />
                      {s}
                    </label>
                  ))}
                  {/* custom schools not in catalog */}
                  {b.schools
                    .filter((s) => !cat.getSchools(b.area).includes(s))
                    .map((s) => (
                      <label key={s} className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked onChange={() => toggleSchool(b.id, s)} />
                        {s} <span className="text-xs text-slate-400">(custom)</span>
                      </label>
                    ))}
                </div>
              ) : (
                <input
                  className="input"
                  value={b.schools.join(", ")}
                  onChange={(e) =>
                    update(b.id, {
                      schools: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  placeholder="School names, comma separated"
                />
              )}

              {catalog && (
                <div className="mt-2 flex gap-2">
                  <input
                    className="input"
                    placeholder="Other school not listed…"
                    value={customSchool[b.id] ?? ""}
                    onChange={(e) =>
                      setCustomSchool((m) => ({ ...m, [b.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomSchool(b.id);
                      }
                    }}
                  />
                  <button type="button" onClick={() => addCustomSchool(b.id)} className="btn-ghost">
                    Add
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      <button type="button" onClick={addBlock} className="btn-ghost">
        + Add another area
      </button>
    </div>
  );
}
