/** Haversine distance in meters between two WGS84 points. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export type SavedPlaceForGeofence = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  radiusMeters: number;
};

/**
 * First saved place whose circle contains the point. Skips places without coordinates.
 */
export function findPlaceContainingPoint(
  places: readonly SavedPlaceForGeofence[],
  lat: number,
  lng: number,
): SavedPlaceForGeofence | null {
  for (const p of places) {
    if (p.lat == null || p.lng == null) continue;
    const d = haversineMeters(lat, lng, p.lat, p.lng);
    const r = Math.max(1, p.radiusMeters ?? 200);
    if (d <= r) return p;
  }
  return null;
}
