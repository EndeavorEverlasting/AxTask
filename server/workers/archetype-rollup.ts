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
import {
  computeEmpathyScore,
  countMarkovTransitions,
} from "../engines/archetype-empathy-engine";
import { type ParsedArchetypeSignalPayload } from "../lib/archetype-signal-payload";
import {
  aggregateArchetypeSignalRows,
  sanitizeSignalsJsonForApi,
  type AggregateResult,
} from "./archetype-rollup-aggregate";

// Re-export the pure helpers so existing callers (server/routes.ts, tests)
// keep working via this module path.
export {
  aggregateArchetypeSignalRows,
  sanitizeSignalsJsonForApi,
  type AggregateResult,
};

/**
 * Exported for backwards-compat with earlier imports (the shape matches the
 * tolerantly-parsed payload). New callers should prefer
 * `ParsedArchetypeSignalPayload` from `../lib/archetype-signal-payload`.
 */
export type ArchetypeSignalPayload = Partial<ParsedArchetypeSignalPayload>;

function dayBucket(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

export interface RollupResult {
  bucketDate: string;
  archetypes: number;
  transitions: number;
  totalSignals: number;
  skippedMalformed: number;
  skippedFutureVersion: number;
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

  const agg = aggregateArchetypeSignalRows(rows.map((r) => r.payloadJson));
  const { perArchetype, perActorSeq, totalSignals, skippedMalformed, skippedFutureVersion } = agg;

  if (skippedMalformed > 0 || skippedFutureVersion > 0) {
    console.warn(
      `[archetype-rollup] ${bucketDate}: skipped ${skippedMalformed} malformed, `
        + `${skippedFutureVersion} future-version row(s)`,
    );
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
    skippedMalformed,
    skippedFutureVersion,
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

