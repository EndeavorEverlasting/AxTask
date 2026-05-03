import type { Task } from "@shared/schema";
import { countMarkovTransitions, toTransitionMatrix } from "@shared/markov/first-order";
import { appendLocalCompletionEvent, getLocalCompletionEvents, type LocalCompletionEvent } from "./local-prediction-ledger";
import { findPlaceContainingPoint, type SavedPlaceForGeofence } from "./geofence-places";
import { apiRequest } from "./queryClient";
import { randomUuid } from "./uuid";

export const LOCAL_MARKOV_PLACE_NONE = "__none__";

export function toMarkovState(classification: string, placeId: string | null): string {
  return `${classification}::place:${placeId ?? LOCAL_MARKOV_PLACE_NONE}`;
}

function completionTimeMs(task: Task): number {
  if (task.updatedAt) {
    const x = new Date(task.updatedAt).getTime();
    if (Number.isFinite(x)) return x;
  }
  if (task.date) {
    const d = new Date(`${task.date}T12:00:00`).getTime();
    if (Number.isFinite(d)) return d;
  }
  return 0;
}

/** Ordered Markov states: backfilled classification-only history + ledger events + late server-only completions. */
export function buildOrderedCompletionStates(
  userId: string,
  ledger: LocalCompletionEvent[],
  allTasks: Task[],
): string[] {
  const ledgerSorted = [...ledger].filter((e) => e.userId === userId).sort((a, b) => a.at - b.at);
  const firstLedgerAt = ledgerSorted[0]?.at ?? Number.POSITIVE_INFINITY;
  const anyLedgerTaskId = new Set(ledgerSorted.map((e) => e.taskId));

  const backfill = allTasks
    .filter((t) => t.userId === userId && t.status === "completed")
    .filter((t) => !anyLedgerTaskId.has(t.id))
    .filter((t) => completionTimeMs(t) < firstLedgerAt)
    .sort((a, b) => completionTimeMs(a) - completionTimeMs(b))
    .map((t) => toMarkovState(t.classification, null));

  const fromLedger = ledgerSorted.map((e) => toMarkovState(e.classification, e.placeId));

  const lateBackfill = allTasks
    .filter((t) => t.userId === userId && t.status === "completed")
    .filter((t) => !anyLedgerTaskId.has(t.id))
    .filter((t) => completionTimeMs(t) >= firstLedgerAt)
    .sort((a, b) => completionTimeMs(a) - completionTimeMs(b))
    .map((t) => toMarkovState(t.classification, null));

  return [...backfill, ...fromLedger, ...lateBackfill];
}

function parseClassificationFromMarkovState(state: string): string {
  const i = state.indexOf("::place:");
  return i >= 0 ? state.slice(0, i) : state;
}

export interface LocalMarkovInsight {
  type: "markov_local";
  title: string;
  description: string;
  confidence: number;
  taskIds: string[];
  data: Record<string, unknown>;
}

/** Prefer local on-device suggestions over server pattern rows that target the same task. */
export function mergePlannerInsights<L extends { taskIds?: string[] }, S extends { taskIds?: string[] }>(
  local: readonly L[],
  server: readonly S[],
  cap: number,
): (L | S)[] {
  const localTaskIds = new Set(local.flatMap((i) => i.taskIds ?? []));
  const serverFiltered = server.filter((s) => !s.taskIds?.some((id) => localTaskIds.has(id)));
  return [...local, ...serverFiltered].slice(0, cap);
}

export function buildLocalMarkovInsights(
  userId: string,
  pendingTasks: Task[],
  allTasks: Task[],
  ledger: LocalCompletionEvent[],
  opts?: { currentPlaceId?: string | null; limit?: number },
): LocalMarkovInsight[] {
  const limit = opts?.limit ?? 3;
  const mine = pendingTasks.filter((t) => t.userId === userId || t.userId == null);
  if (mine.length === 0) return [];

  const seq = buildOrderedCompletionStates(userId, ledger, allTasks);
  if (seq.length < 2) return [];

  const matrix = toTransitionMatrix(countMarkovTransitions(new Map([["chain", seq]])));
  const lastState = seq[seq.length - 1]!;
  const prevState = seq.length >= 2 ? seq[seq.length - 2]! : null;

  let probs = matrix.filter((r) => r.from === lastState && r.count > 0);
  if (probs.length === 0 && prevState) {
    probs = matrix.filter((r) => r.from === prevState && r.count > 0);
  }
  if (probs.length === 0) return [];

  const placeBoost =
    opts?.currentPlaceId != null && opts.currentPlaceId !== ""
      ? (to: string) => (to.includes(`::place:${opts.currentPlaceId}`) ? 1.25 : 1)
      : () => 1;

  const scorePending = (t: Task) => {
    const cls = t.classification;
    const candidates = [
      toMarkovState(cls, opts?.currentPlaceId ?? null),
      toMarkovState(cls, null),
    ];
    let best = 0;
    for (const to of candidates) {
      const row = probs.find((p) => p.to === to);
      const base = row?.probability ?? 0;
      best = Math.max(best, base * placeBoost(to));
    }
    for (const r of probs) {
      if (parseClassificationFromMarkovState(r.to) === cls) {
        best = Math.max(best, r.probability * placeBoost(r.to));
      }
    }
    return { task: t, score: best };
  };

  let scored = mine.map(scorePending).sort((a, b) => b.score - a.score);
  let top = scored.filter((s) => s.score > 0).slice(0, limit);

  if (top.length === 0) {
    const sortedProbs = [...probs].sort((a, b) => b.probability - a.probability);
    const picked: LocalMarkovInsight[] = [];
    for (const r of sortedProbs) {
      const c = parseClassificationFromMarkovState(r.to);
      const tasks = mine.filter((t) => t.classification === c).slice(0, 1);
      for (const task of tasks) {
        picked.push({
          type: "markov_local",
          title: task.activity,
          description:
            `On-device pattern: "${c}" class tasks often follow your recent completions (${Math.round(r.probability * 100)}% estimated transition).`,
          confidence: Math.min(95, Math.round(40 + r.probability * 55)),
          taskIds: [task.id],
          data: { source: "local_markov", score: r.probability, via: "classification_fallback" },
        });
        if (picked.length >= limit) break;
      }
      if (picked.length >= limit) break;
    }
    return picked;
  }

  return top.map((s) => ({
    type: "markov_local" as const,
    title: s.task.activity,
    description: `On-device pattern: after your recent completions, this kind of work often comes next (${Math.round(s.score * 100)}% transition strength).`,
    confidence: Math.min(95, Math.round(35 + s.score * 65)),
    taskIds: [s.task.id],
    data: { source: "local_markov", score: s.score },
  }));
}

async function fetchSavedPlaces(): Promise<SavedPlaceForGeofence[]> {
  try {
    const r = await apiRequest("GET", "/api/location-places");
    const j = (await r.json()) as { places?: SavedPlaceForGeofence[] };
    return Array.isArray(j.places) ? j.places : [];
  } catch {
    return [];
  }
}

/**
 * Append a device-only completion row (with optional geofence match). Never sends this payload to the server.
 */
export async function recordTaskCompletedForPrediction(params: {
  userId: string;
  task: Task;
  previousStatus?: string;
}): Promise<void> {
  if (!params.userId) return;
  if (params.task.status !== "completed") return;
  if (params.previousStatus === "completed") return;

  let placeId: string | null = null;
  if (typeof navigator !== "undefined" && navigator.geolocation?.getCurrentPosition) {
    const places = await fetchSavedPlaces();
    if (places.some((p) => p.lat != null && p.lng != null)) {
      placeId = await new Promise<string | null>((resolve) => {
        const timer = window.setTimeout(() => resolve(null), 4500);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            window.clearTimeout(timer);
            const m = findPlaceContainingPoint(places, pos.coords.latitude, pos.coords.longitude);
            resolve(m?.id ?? null);
          },
          () => {
            window.clearTimeout(timer);
            resolve(null);
          },
          { enableHighAccuracy: false, timeout: 4000, maximumAge: 120_000 },
        );
      });
    }
  }

  await appendLocalCompletionEvent({
    id: randomUuid(),
    userId: params.userId,
    at: Date.now(),
    taskId: params.task.id,
    classification: params.task.classification,
    placeId,
  });
}

export async function loadLocalCompletionLedger(userId: string): Promise<LocalCompletionEvent[]> {
  if (!userId) return [];
  return getLocalCompletionEvents(userId);
}
