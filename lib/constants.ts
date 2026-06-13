import type { VehicleType } from "@/lib/types";

/** Major Pakistani cities VanSafe operates in, with Urdu display names. */
export const CITIES: { name: string; urdu: string }[] = [
  { name: "Lahore", urdu: "لاہور" },
  { name: "Karachi", urdu: "کراچی" },
  { name: "Islamabad", urdu: "اسلام آباد" },
  { name: "Rawalpindi", urdu: "راولپنڈی" },
  { name: "Faisalabad", urdu: "فیصل آباد" },
  { name: "Multan", urdu: "ملتان" },
  { name: "Peshawar", urdu: "پشاور" },
  { name: "Quetta", urdu: "کوئٹہ" },
  { name: "Sialkot", urdu: "سیالکوٹ" },
  { name: "Gujranwala", urdu: "گوجرانوالہ" },
];

export const CITY_NAMES = CITIES.map((c) => c.name);

/** "Lahore — لاہور" style label for a city name. */
export function cityLabel(name: string): string {
  const c = CITIES.find((x) => x.name === name);
  return c ? `${c.name} — ${c.urdu}` : name;
}

export const VEHICLE_TYPES: VehicleType[] = ["Van", "Wagon", "Hi-Roof"];
