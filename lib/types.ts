import type { VehicleCategory } from "@/lib/vehicles";

export type Role = "parent" | "driver";
/** Vehicle size category — see lib/vehicles.ts for the model catalog. */
export type VehicleType = VehicleCategory;
export type TrackStatus = "moving" | "stopped" | "idle";
export type AlertType =
  | "departed"
  | "arrived"
  | "stationary"
  | "route_deviation"
  | "info";

export interface Profile {
  id: string;
  role: Role;
  name: string;
  email: string;
  whatsapp: string;
  city: string;
  area: string;
  school: string;
  created_at: string;
}

export interface Driver {
  id: string;
  area: string;
  areas: string[];
  schools: string[];
  vehicle_type: VehicleType;
  /** Catalog model name (e.g. "Toyota Hiace (High Roof)") or "" / "Other". */
  vehicle_model: string;
  plate: string;
  /** Driver's actual stated seat count (may be an override of the standard). */
  capacity: number;
  /** Official standard capacity — immutable safety benchmark for overcrowding. */
  official_capacity: number;
  occupancy: number;
  make_model: string;
  color: string;
  year: number | null;
  bio: string;
  cnic_url: string | null;
  vehicle_doc_url: string | null;
  verified: boolean;
  rating: number;
  review_count: number;
  created_at: string;
}

/** A driver joined with their profile — used across card / profile views. */
export interface DriverWithProfile extends Driver {
  profile: Pick<Profile, "name" | "whatsapp" | "city">;
}

export interface Child {
  id: string;
  parent_id: string;
  name: string;
  school: string;
  pickup_address: string;
  driver_id: string | null;
  created_at: string;
}

export interface Review {
  id: string;
  driver_id: string;
  parent_id: string;
  rating: number;
  comment: string;
  created_at: string;
}

export interface LocationPing {
  id: string;
  driver_id: string;
  lat: number;
  lng: number;
  created_at: string;
}

export interface TrackingSession {
  driver_id: string;
  active: boolean;
  status: TrackStatus;
  started_at: string | null;
  pings_today: number;
  last_ping_date: string | null;
}

export interface AlertRow {
  id: string;
  parent_id: string;
  driver_id: string;
  type: AlertType;
  message: string;
  created_at: string;
}

export interface MatchResult {
  driverId: string;
  score: number;
  reason: string;
}
