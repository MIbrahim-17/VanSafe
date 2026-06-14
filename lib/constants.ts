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

/** Approximate city-centre coordinates, used to centre the map picker. */
export const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  Lahore: { lat: 31.5204, lng: 74.3587 },
  Karachi: { lat: 24.8607, lng: 67.0011 },
  Islamabad: { lat: 33.6844, lng: 73.0479 },
  Rawalpindi: { lat: 33.5651, lng: 73.0169 },
  Faisalabad: { lat: 31.4504, lng: 73.135 },
  Multan: { lat: 30.1575, lng: 71.5249 },
  Peshawar: { lat: 34.0151, lng: 71.5249 },
  Quetta: { lat: 30.1798, lng: 66.975 },
  Sialkot: { lat: 32.4927, lng: 74.5319 },
  Gujranwala: { lat: 32.1877, lng: 74.1945 },
};

export function cityCenter(city?: string): { lat: number; lng: number } {
  return (city && CITY_CENTERS[city]) || { lat: 30.3753, lng: 69.3451 }; // Pakistan
}

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
