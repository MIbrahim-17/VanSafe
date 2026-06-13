export type Role = "parent" | "driver";
export type VehicleType = "Van" | "Wagon" | "Hi-Roof";
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
  created_at: string;
}

export interface Driver {
  id: string;
  area: string;
  schools: string[];
  vehicle_type: VehicleType;
  plate: string;
  capacity: number;
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

export interface LinkRow {
  id: string;
  parent_id: string;
  driver_id: string;
  child_name: string;
  school: string;
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
