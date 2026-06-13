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

/**
 * Current petrol price in PKR per litre, used for fuel-cost estimates.
 * Update periodically as the pump price changes (or override via env at deploy).
 */
export const PETROL_PRICE_PKR = Number(process.env.NEXT_PUBLIC_PETROL_PRICE) || 264;

/** Fallback vehicle fuel average (km per litre) when a driver hasn't set one. */
export const DEFAULT_FUEL_AVG_KMPL = 10;

/** Route optimization is capped at this many pickup stops for speed/reliability. */
export const MAX_ROUTE_STOPS = 15;

/** Fuel cost (PKR) for a distance, given a vehicle's km/L average. */
export function fuelCostPKR(distanceMeters: number, kmPerLitre: number): number {
  const litres = distanceMeters / 1000 / (kmPerLitre > 0 ? kmPerLitre : DEFAULT_FUEL_AVG_KMPL);
  return litres * PETROL_PRICE_PKR;
}

/** "Lahore — لاہور" style label for a city name. */
export function cityLabel(name: string): string {
  const c = CITIES.find((x) => x.name === name);
  return c ? `${c.name} — ${c.urdu}` : name;
}
