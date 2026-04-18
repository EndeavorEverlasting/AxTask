/**
 * Archetype rollup worker.
 *
 * Scans tamper-evident `security_events` rows with
 * `event_type='archetype_signal'` for a given day, aggregates by archetype,
 * writes to `archetype_rollup_daily`, and computes first-order Markov
 * transition counts into `archetype_markov_daily`.
 *
 * Per the privacy model (docs/ARCHETYPE_EMPATHY_ANALYTICS.md), the rollup
 * never persists hashedActor downstream — hashedActor is only used
 * transiently to order events per actor for Markov construction.
 */

import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "../db";
import {
  securityEvents,
  archetypeRollupDaily,
  archetypeMarkovDaily,
} from "@shared/schema";
import { ARCHETYPE_KEYS, isArchetypeKey } from "@shared/avatar-archetypes";
import {
  EMPTY_SIGNAL_COUNTS,
  computeEmpathyScore,
  countMarkovTransitions,
  type ArchetypeSignalCounts,
} from "../engines/archetype-empathy-engine";

export type ArchetypeSignalPayload = {
  archetypeKey?: string;
  hashedActor?: string;
  signal?: "nudge_shown" | "nudge_dismissed" | "nudge_opened" | "feedback_submitted";
  insightful?: "up" | "down" | null;
  sentiment?: "positive" | "neutral" | "negative" | null;
  sourceCategory?: string;
};

function dayBucket(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function parsePayload(raw: string | null): ArchetypeSignalPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as ArchetypeSignalPayload) : null;
  } catch {
    return null;
  }
}

export interface RollupResult {
  bucketDate: string;
  archetypes: number;
  transitions: number;
  totalSignals: number;
}

/**
 * Rebuild rollups for a single UTC day. Idempotent: deletes existing rows for
 * the bucket date and re-inserts, so re-running cleans up any partial work.
 */
export async function runArchetypeRollupForDay(day: Date): Promise<RollupResult> {
  const bucketDate = dayBucket(day);
  const start = new Date(`${bucketDate}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      payloadJson: securityEvents.payloadJson,
      createdAt: securityEvents.createdAt,
    })
    .from(securityEvents)
    .where(and(
      eq(securityEvents.eventType, "archetype_signal"),
      gte(securityEvents.createdAt, start),
      lt(securityEvents.createdAt, end),
    ))
    .orderBy(securityEvents.createdAt);

  const perArchetype = new Map<string, ArchetypeSignalCounts>();
  for (const key of ARCHETYPE_KEYS) {
    perArchetype.set(key, { ...EMPTY_SIGNAL_COUNTS });
  }

  const perActorSeq = new Map<string, string[]>();
  let totalSignals = 0;

  for (const row of rows) {
    const payload = parsePayload(row.payloadJson);
    if (!payload) continue;
    const key = payload.archetypeKey;
    if (!key || !isArchetypeKey(key)) continue;
    const bucket = perArchetype.get(key);
    if (!bucket) continue;

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

  // Replace the day's rollups idempotently.
  await db.delete(archetypeRollupDaily).where(eq(archetypeRollupDaily.bucketDate, bucketDate));
  await db.delete(archetypeMarkovDaily).where(eq(archetypeMarkovDaily.bucketDate, bucketDate));

  let insertedArchetypes = 0;
  for (const [archetypeKey, signalCounts] of perArchetype.entries()) {
    const score = computeEmpathyScore(signalCounts);
    // Skip rows that have no activity at all — keeps the table clean.
    if (score.samples === 0) continue;
    await db.insert(archetypeRollupDaily).values({
      archetypeKey,
      bucketDate,
      empathyScore: score.empathyScore,
      samples: score.samples,
      signalsJson: {
        counts: signalCounts,
        subScores: score.subScores,
      },
    });
    insertedArchetypes += 1;
  }

  const markov = countMarkovTransitions(perActorSeq);
  let insertedTransitions = 0;
  for (const [key, count] of Object.entries(markov.pairs)) {
    const [fromArchetype, toArchetype] = key.split("->");
    if (!fromArchetype || !toArchetype) continue;
    await db.insert(archetypeMarkovDaily).values({
      fromArchetype,
      toArchetype,
      bucketDate,
      count,
    });
    insertedTransitions += 1;
  }

  return {
    bucketDate,
    archetypes: insertedArchetypes,
    transitions: insertedTransitions,
    totalSignals,
  };
}

/**
 * Rollup the previous UTC day. Safe to call repeatedly; deletes + re-inserts.
 */
export async function runArchetypeRollupForYesterday(): Promise<RollupResult> {
  const now = Date.now();
  const yesterday = new Date(now - 24 * 60 * 60 * 1000);
  return runArchetypeRollupForDay(yesterday);
}

const DEFAULT_TICK_MS = 60 * 60 * 1000; // 1 hour

/**
 * Background tick driver. Wire into server startup (see server/index.ts).
 * Rolls up today-so-far and yesterday on each tick so the latest aggregates
 * are always available for RAG / predictive reads.
 */
export function startArchetypeRollupTicker(intervalMs: number = DEFAULT_TICK_MS): () => void {
  const tick = async () => {
    try {
      await runArchetypeRollupForDay(new Date());
      await runArchetypeRollupForYesterday();
    } catch (err) {
      console.warn("[archetype-rollup] tick failed:", (err as Error)?.message || String(err));
    }
  };
  void tick();
  const handle = setInterval(() => { void tick(); }, intervalMs);
  return () => clearInterval(handle);
}

/** Used by read APIs to avoid leaking hashedActor even if signalsJson is fetched. */
export function sanitizeSignalsJsonForApi(signalsJson: unknown): {
  counts: ArchetypeSignalCounts;
  subScores: Record<string, number>;
} | null {
  if (!signalsJson || typeof signalsJson !== "object") return null;
  const raw = signalsJson as { counts?: unknown; subScores?: unknown };
  if (!raw.counts || typeof raw.counts !== "object") return null;
  // Strictly whitelist known fields.
  const c = raw.counts as Record<string, unknown>;
  const pick = (k: keyof ArchetypeSignalCounts): number => {
    const v = c[k];
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
  const rawSub = raw.subScores && typeof raw.subScores === "object" ? raw.subScores as Record<string, unknown> : {};
  const subScores: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawSub)) {
    if (typeof v === "number" && Number.isFinite(v)) subScores[k] = v;
  }
  return { counts, subScores };
}
