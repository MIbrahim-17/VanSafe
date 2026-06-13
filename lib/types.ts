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
  pickup_lat: number | null;
  pickup_lng: number | null;
  driver_id: string | null;
  created_at: string;
}

export type RoutePeriod = "morning" | "afternoon";
export type AttendanceStatus = "present" | "absent";
export type RouteEngine = "google" | "osrm" | "haversine";

export interface BaseRoute {
  driver_id: string;
  home_address: string;
  home_lat: number | null;
  home_lng: number | null;
  school_name: string;
  school_lat: number | null;
  school_lng: number | null;
  child_order: string[];
  fuel_avg_kmpl: number;
  updated_at: string;
}

export interface AttendanceRow {
  id: string;
  child_id: string;
  driver_id: string | null;
  parent_id: string;
  date: string;
  status: AttendanceStatus;
  marked_by: "driver" | "parent";
  created_at: string;
}

export interface RouteLog {
  id: string;
  driver_id: string;
  date: string;
  period: RoutePeriod;
  stops: number;
  optimized_distance_m: number;
  unoptimized_distance_m: number;
  duration_s: number;
  fuel_cost: number;
  fuel_saved: number;
  distance_saved_m: number;
  time_saved_s: number;
  engine: RouteEngine;
  created_at: string;
}

/** A single ordered stop in an optimized route. */
export interface RouteStop {
  childId: string;
  name: string;
  lat: number;
  lng: number;
  order: number;
}

/** Result returned by the optimizer + /api/route/optimize. */
export interface OptimizeResult {
  period: RoutePeriod;
  engine: RouteEngine;
  stops: RouteStop[];
  /** Decoded [lat,lng] polyline of the optimized route for map display. */
  polyline: [number, number][];
  optimizedDistanceM: number;
  unoptimizedDistanceM: number;
  durationS: number;
  fuelCost: number;
  fuelSaved: number;
  distanceSavedM: number;
  timeSavedS: number;
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
