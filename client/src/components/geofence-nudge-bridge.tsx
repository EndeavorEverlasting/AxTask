import { useGeofenceSuggestionNudge } from "@/hooks/use-geofence-suggestion-nudge";

/** Mount once under auth to run foreground geofence + local suggestion nudges. */
export function GeofenceNudgeBridge() {
  useGeofenceSuggestionNudge();
  return null;
}
