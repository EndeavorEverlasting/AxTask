import { describe, expect, it } from "vitest";
import { findPlaceContainingPoint, haversineMeters } from "./geofence-places";

describe("geofence-places", () => {
  it("haversineMeters is ~0 for identical points", () => {
    expect(haversineMeters(40.7, -74, 40.7, -74)).toBeLessThan(1);
  });

  it("findPlaceContainingPoint returns first matching circle", () => {
    const places = [
      { id: "a", name: "Far", lat: 41.0, lng: -74.0, radiusMeters: 50 },
      { id: "b", name: "Here", lat: 40.7128, lng: -74.006, radiusMeters: 500 },
    ];
    const hit = findPlaceContainingPoint(places, 40.713, -74.0065);
    expect(hit?.id).toBe("b");
  });

  it("skips places without coordinates", () => {
    const places = [{ id: "x", name: "No coords", lat: null, lng: null, radiusMeters: 500 }];
    expect(findPlaceContainingPoint(places, 40, -74)).toBeNull();
  });
});
