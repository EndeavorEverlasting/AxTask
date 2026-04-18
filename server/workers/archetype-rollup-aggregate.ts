/**
 * DB-free pure helpers for the archetype rollup worker.
 *
 * Split out from `archetype-rollup.ts` so unit tests can exercise the
 * aggregation / sanitization logic without loading `server/db.ts` (which
 * throws at import time when `DATABASE_URL` is unset).
 */

import { ARCHETYPE_KEYS } from "@shared/avatar-archetypes";
import {
  EMPTY_SIGNAL_COUNTS,
  type ArchetypeSignalCounts,
} from "../engines/archetype-empathy-engine";
import {
  parseArchetypeSignalPayload,
  isFutureBreakingVersion,
} from "../lib/archetype-signal-payload";

export interface AggregateResult {
  perArchetype: Map<string, ArchetypeSignalCounts>;
  perActorSeq: Map<string, string[]>;
  totalSignals: number;
  skippedMalformed: number;
  skippedFutureVersion: number;
}

/**
 * Pure accumulator: turn an array of raw payloads (strings or objects, as
 * they come out of `security_events.payload_json`) into the per-archetype
 * count matrix and per-actor sequence map used to build empathy scores and
 * Markov transitions.
 */
export function aggregateArchetypeSignalRows(payloads: readonly unknown[]): AggregateResult {
  const perArchetype = new Map<string, ArchetypeSignalCounts>();
  for (const key of ARCHETYPE_KEYS) {
    perArchetype.set(key, { ...EMPTY_SIGNAL_COUNTS });
  }
  const perActorSeq = new Map<string, string[]>();
  let totalSignals = 0;
  let skippedMalformed = 0;
  let skippedFutureVersion = 0;

  for (const raw of payloads) {
    const parsed = parseArchetypeSignalPayload(raw);
    if (!parsed.ok) {
      skippedMalformed += 1;
      continue;
    }
    if (isFutureBreakingVersion(parsed.version)) {
      skippedFutureVersion += 1;
    }

    const { payload } = parsed;
    const key = payload.archetypeKey;
    const bucket = perArchetype.get(key);
    if (!bucket) {
      skippedMalformed += 1;
      continue;
    }

    switch (payload.signal) {
      case "nudge_shown": bucket.shown += 1; break;
      case "nudge_opened": bucket.opened += 1; break;
      case "nudge_dismissed": bucket.dismissed += 1; break;
      case "feedback_submitted": bucket.submitted += 1; break;
    }
    if (payload.insightful === "up") bucket.insightfulUp += 1;
    else if (payload.insightful === "down") bucket.insightfulDown += 1;

    if (payload.sentiment === "positive") bucket.sentimentPositive += 1;
    else if (payload.sentiment === "neutral") bucket.sentimentNeutral += 1;
    else if (payload.sentiment === "negative") bucket.sentimentNegative += 1;

    if (payload.hashedActor) {
      const seq = perActorSeq.get(payload.hashedActor) ?? [];
      seq.push(key);
      perActorSeq.set(payload.hashedActor, seq);
    }

    totalSignals += 1;
  }

  return { perArchetype, perActorSeq, totalSignals, skippedMalformed, skippedFutureVersion };
}

/**
 * Used by read APIs to avoid leaking hashedActor even if signalsJson is fetched.
 *
 * Tolerates legacy / forward-compat rows:
 *  - missing `subScores` (older rollup shape) returns `{}`
 *  - unknown keys in `counts` or `subScores` are dropped
 *  - non-numeric / non-finite values are coerced to 0
 *  - entirely missing `counts` returns all-zero counts rather than null so
 *    downstream consumers never see a partial shape.
 */
export function sanitizeSignalsJsonForApi(signalsJson: unknown): {
  counts: ArchetypeSignalCounts;
  subScores: Record<string, number>;
} | null {
  if (!signalsJson || typeof signalsJson !== "object" || Array.isArray(signalsJson)) {
    return null;
  }
  const raw = signalsJson as { counts?: unknown; subScores?: unknown };

  const countsObj =
    raw.counts && typeof raw.counts === "object" && !Array.isArray(raw.counts)
      ? (raw.counts as Record<string, unknown>)
      : {};
  const pick = (k: keyof ArchetypeSignalCounts): number => {
    const v = countsObj[k];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };
  const counts: ArchetypeSignalCounts = {
    shown: pick("shown"),
    opened: pick("opened"),
    dismissed: pick("dismissed"),
    submitted: pick("submitted"),
    insightfulUp: pick("insightfulUp"),
    insightfulDown: pick("insightfulDown"),
    sentimentPositive: pick("sentimentPositive"),
    sentimentNeutral: pick("sentimentNeutral"),
    sentimentNegative: pick("sentimentNegative"),
  };
  const subScoresObj =
    raw.subScores && typeof raw.subScores === "object" && !Array.isArray(raw.subScores)
      ? (raw.subScores as Record<string, unknown>)
      : {};
  const subScores: Record<string, number> = {};
  for (const [k, v] of Object.entries(subScoresObj)) {
    if (typeof v === "number" && Number.isFinite(v)) subScores[k] = v;
  }
  return { counts, subScores };
}
