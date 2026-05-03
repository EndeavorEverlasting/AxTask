import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import type { Task } from "@shared/schema";
import { findPlaceContainingPoint, type SavedPlaceForGeofence } from "@/lib/geofence-places";
import {
  buildLocalMarkovInsights,
  loadLocalCompletionLedger,
} from "@/lib/local-markov-predictions";
import { useToast } from "@/hooks/use-toast";

export const GEOFENCE_NUDGES_LS_KEY = "axtask_geofence_nudges_enabled";

export function readGeofenceNudgesEnabled(): boolean {
  try {
    return localStorage.getItem(GEOFENCE_NUDGES_LS_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeGeofenceNudgesEnabled(on: boolean): void {
  try {
    localStorage.setItem(GEOFENCE_NUDGES_LS_KEY, on ? "1" : "0");
  } catch {
    /* */
  }
}

const POLL_MS = 90_000;
const PLACE_NUDGE_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Best-effort foreground geofence checks + local Markov suggestions.
 * Respects `readGeofenceNudgesEnabled()` and never uploads location or ledger to the server.
 */
export function useGeofenceSuggestionNudge(): void {
  const { user } = useAuth();
  const { toast } = useToast();
  const insideRef = useRef<Set<string>>(new Set());
  const lastNudgeRef = useRef<Map<string, number>>(new Map());
  const [geofencePref, setGeofencePref] = useState(readGeofenceNudgesEnabled);

  useEffect(() => {
    const sync = () => setGeofencePref(readGeofenceNudgesEnabled());
    window.addEventListener("axtask-geofence-nudges-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("axtask-geofence-nudges-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const { data: allTasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    staleTime: 30_000,
    enabled: Boolean(user),
  });

  const { data: placesPayload } = useQuery<{ places: SavedPlaceForGeofence[] }>({
    queryKey: ["/api/location-places"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/location-places");
      return r.json() as Promise<{ places: SavedPlaceForGeofence[] }>;
    },
    staleTime: 120_000,
    enabled: Boolean(user),
  });

  useEffect(() => {
    if (!user) return;
    if (!geofencePref) return;
    if (typeof navigator === "undefined" || !navigator.geolocation?.getCurrentPosition) return;

    const places = placesPayload?.places ?? [];
    if (!places.some((p) => p.lat != null && p.lng != null)) return;

    const uid = user.id;

    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const match = findPlaceContainingPoint(places, pos.coords.latitude, pos.coords.longitude);
          const now = Date.now();

          if (!match) {
            insideRef.current.clear();
            return;
          }

          const wasInside = insideRef.current.has(match.id);
          insideRef.current.add(match.id);

          if (wasInside) return;

          const last = lastNudgeRef.current.get(match.id) ?? 0;
          if (now - last < PLACE_NUDGE_COOLDOWN_MS) return;

          const ledger = await loadLocalCompletionLedger(uid);
          const pending = allTasks.filter((t) => t.status !== "completed");
          const insights = buildLocalMarkovInsights(uid, pending, allTasks, ledger, {
            currentPlaceId: match.id,
            limit: 2,
          });

          lastNudgeRef.current.set(match.id, now);

          if (insights.length > 0) {
            const top = insights[0]!;
            toast({
              title: `Near ${match.name}`,
              description: top.description,
            });
          } else {
            toast({
              title: `Near ${match.name}`,
              description: "Open AxTask to see tasks — on-device suggestions improve as you complete work here.",
            });
          }

          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            void new Notification("AxTask", {
              body:
                insights.length > 0
                  ? `Near ${match.name}: ${insights[0]!.title}`
                  : `You're near ${match.name}. Open AxTask for your list.`,
            });
          }
        },
        () => {
          /* denied / timeout — fail closed */
        },
        { enableHighAccuracy: false, timeout: 12_000, maximumAge: 120_000 },
      );
    };

    tick();
    const id = window.setInterval(tick, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user, placesPayload, allTasks, toast, geofencePref]);
}
