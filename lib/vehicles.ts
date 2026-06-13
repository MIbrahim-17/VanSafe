/**
 * Real Pakistani school-van catalog.
 *
 * Models commonly used as school vans, grouped by size category, each with its
 * OFFICIAL standard seating capacity. The official capacity is the immutable
 * safety benchmark for overcrowding warnings — a driver may override their own
 * stated seat count (e.g. a modified Bolan) but cannot lower the benchmark.
 */

export type VehicleCategory = "Mini Van" | "Standard Van" | "Hi-Roof";

export const VEHICLE_CATEGORIES: VehicleCategory[] = [
  "Mini Van",
  "Standard Van",
  "Hi-Roof",
];

export interface VehicleModel {
  /** Display name, also the value stored in `drivers.vehicle_model`. */
  name: string;
  /** Official standard seating capacity (safety benchmark). */
  capacity: number;
  category: VehicleCategory;
}

/** "Other — دیگر" sentinel for vehicles not in the catalog. */
export const OTHER_VEHICLE = "Other";

export const VEHICLE_GROUPS: { category: VehicleCategory; models: VehicleModel[] }[] = [
  {
    category: "Mini Van",
    models: [
      { name: "Suzuki Bolan (Carry Dabba)", capacity: 8, category: "Mini Van" },
      { name: "Suzuki Every", capacity: 8, category: "Mini Van" },
      { name: "Suzuki Every Wagon", capacity: 8, category: "Mini Van" },
      { name: "FAW X-PV", capacity: 7, category: "Mini Van" },
      { name: "Daihatsu Hijet", capacity: 7, category: "Mini Van" },
    ],
  },
  {
    category: "Standard Van",
    models: [
      { name: "Changan Karvaan (Standard)", capacity: 7, category: "Standard Van" },
      { name: "Changan Karvaan Plus", capacity: 8, category: "Standard Van" },
      { name: "Changan Karvaan Hi-Roof", capacity: 11, category: "Standard Van" },
      { name: "Suzuki APV", capacity: 8, category: "Standard Van" },
    ],
  },
  {
    category: "Hi-Roof",
    models: [
      { name: "Toyota Hiace (Standard)", capacity: 14, category: "Hi-Roof" },
      { name: "Toyota Hiace (Grand Cabin)", capacity: 15, category: "Hi-Roof" },
      { name: "Toyota Hiace (High Roof)", capacity: 17, category: "Hi-Roof" },
      { name: "Nissan Serena", capacity: 8, category: "Hi-Roof" },
    ],
  },
];

/** Flat list of every catalog model. */
export const VEHICLE_MODELS: VehicleModel[] = VEHICLE_GROUPS.flatMap((g) => g.models);

/** Look up a catalog model by its exact name. */
export function findVehicle(name: string): VehicleModel | undefined {
  return VEHICLE_MODELS.find((m) => m.name === name);
}

/** True if a stored vehicle_model value refers to a known catalog model. */
export function isCatalogVehicle(name: string): boolean {
  return !!name && name !== OTHER_VEHICLE && !!findVehicle(name);
}

/**
 * The official seating capacity to benchmark against.
 * Catalog models use their fixed capacity; "Other" vehicles fall back to the
 * driver-entered capacity (which is mandatory for them).
 */
export function benchmarkCapacity(vehicleModel: string, enteredCapacity: number): number {
  const m = findVehicle(vehicleModel);
  return m ? m.capacity : enteredCapacity;
}

/** Urdu label per category, for bilingual badges. */
export const CATEGORY_URDU: Record<VehicleCategory, string> = {
  "Mini Van": "منی وین",
  "Standard Van": "اسٹینڈرڈ وین",
  "Hi-Roof": "ہائی روف",
};
