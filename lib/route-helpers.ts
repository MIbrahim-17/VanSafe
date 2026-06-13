/**
 * Server-side helpers shared by the route page and the optimize endpoint.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { geocodeAddress } from "@/lib/geocode";
import type { Child } from "@/lib/types";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Ensure each child with a pickup address has coordinates, geocoding (and
 * persisting) any that are missing. Children with no address are returned
 * unchanged so callers can flag them as "address missing".
 */
export async function ensureChildCoords(
  admin: Admin,
  children: Child[],
  city?: string
): Promise<Child[]> {
  const out: Child[] = [];
  for (const c of children) {
    const missing = c.pickup_lat == null || c.pickup_lng == null;
    if (missing && c.pickup_address?.trim()) {
      const geo = await geocodeAddress(c.pickup_address, city);
      if (geo) {
        await admin
          .from("children")
          .update({ pickup_lat: geo.lat, pickup_lng: geo.lng })
          .eq("id", c.id);
        out.push({ ...c, pickup_lat: geo.lat, pickup_lng: geo.lng });
        continue;
      }
    }
    out.push(c);
  }
  return out;
}

/** A child is routable only once it has resolved pickup coordinates. */
export function hasCoords(c: Child): boolean {
  return c.pickup_lat != null && c.pickup_lng != null;
}
