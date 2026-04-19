/**
 * Append-only data retention worker.
 *
 * AxTask logs a lot on the hot path: every authenticated API call goes
 * into `security_events`, every admin-meaningful action into
 * `security_logs`, and daily snapshots into `usage_snapshots`. Left
 * unbounded those tables are the single largest contributor to Neon's
 * 512 MB project-size ceiling — and hitting that ceiling is exactly what
 * killed the prior deploy (Postgres 53100, neon.max_cluster_size).
 *
 * This worker runs daily, deletes rows older than each table's retention
 * window, and logs the counts. It does NOT run `VACUUM FULL` (that's for
 * the one-time operator cleanup; the regular autovacuum plus the bounded
 * churn is enough to keep table size flat day-to-day).
 *
 * Pure helpers (`computeRetentionWindows`) are unit-tested in
 * [retention-prune.test.ts]. The scheduler driver is tested with fake
 * timers via dependency injection.
 *
 * See docs/MODULE_LAYOUT.md for target home (`server/workers/` is fine
 * either way — this will stay in workers/).
 */
import { lt } from "drizzle-orm";
import { db } from "../db";
import {
  securityEvents,
  securityLogs,
  usageSnapshots,
  passwordResetTokens,
} from "@shared/schema";

export const DEFAULT_RETENTION_WINDOWS = {
  /** security_events is the hot-path API audit trail. 30 days is
   *  enough for forensics and breach investigation; older rows are
   *  already rolled up into `archetype_rollup_daily` where relevant. */
  securityEventsDays: 30,
  /** security_logs is the legacy admin audit log. 30 days matches the
   *  operator expectation documented in docs/CLIENT_VISIBLE_PRIVACY.md. */
  securityLogsDays: 30,
  /** usage_snapshots are daily per-user rollups; 60 days is 2 months of
   *  history for the Admin > Usage tab. */
  usageSnapshotsDays: 60,
  /** password_reset_tokens expire quickly and are single-use; once
   *  consumed or expired they're just noise. */
  passwordResetTokensDays: 7,
} as const;

export interface RetentionWindowInput {
  securityEventsDays?: number;
  securityLogsDays?: number;
  usageSnapshotsDays?: number;
  passwordResetTokensDays?: number;
}

export interface RetentionWindows {
  securityEventsBefore: Date;
  securityLogsBefore: Date;
  usageSnapshotsBefore: Date;
  passwordResetTokensBefore: Date;
}

/**
 * Pure: turn a window spec into concrete "delete anything older than
 * this timestamp" cutoffs, using `now` as the reference. All inputs are
 * days; callers may omit any field to fall back to the default.
 */
export function computeRetentionWindows(
  input: RetentionWindowInput = {},
  now: Date = new Date(),
): RetentionWindows {
  const clamp = (n: unknown, fallback: number): number => {
    const v = Number(n);
    if (!Number.isFinite(v) || v < 1) return fallback;
    return Math.floor(v);
  };
  const d = {
    securityEventsDays: clamp(input.securityEventsDays, DEFAULT_RETENTION_WINDOWS.securityEventsDays),
    securityLogsDays: clamp(input.securityLogsDays, DEFAULT_RETENTION_WINDOWS.securityLogsDays),
    usageSnapshotsDays: clamp(input.usageSnapshotsDays, DEFAULT_RETENTION_WINDOWS.usageSnapshotsDays),
    passwordResetTokensDays: clamp(input.passwordResetTokensDays, DEFAULT_RETENTION_WINDOWS.passwordResetTokensDays),
  };
  const day = 24 * 60 * 60 * 1000;
  return {
    securityEventsBefore: new Date(now.getTime() - d.securityEventsDays * day),
    securityLogsBefore: new Date(now.getTime() - d.securityLogsDays * day),
    usageSnapshotsBefore: new Date(now.getTime() - d.usageSnapshotsDays * day),
    passwordResetTokensBefore: new Date(now.getTime() - d.passwordResetTokensDays * day),
  };
}

export interface RetentionPruneResult {
  securityEventsDeleted: number;
  securityLogsDeleted: number;
  usageSnapshotsDeleted: number;
  passwordResetTokensDeleted: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  /** Individual-step errors are captured here rather than thrown, so one
   *  failing table doesn't mask space recovered from the others. */
  errors: Array<{ table: string; message: string }>;
}

/**
 * Runs one retention sweep. Each table is pruned independently so a
 * failure on one does not prevent the others from recovering space.
 *
 * `deps.deleteOlderThan` is injected so unit tests don't need a live DB.
 */
export interface RetentionPruneDeps {
  deleteOlderThan: (table: "security_events" | "security_logs" | "usage_snapshots" | "password_reset_tokens", before: Date) => Promise<number>;
  log?: (message: string, meta?: Record<string, unknown>) => void;
}

export async function runRetentionPrune(
  input: RetentionWindowInput = {},
  deps?: Partial<RetentionPruneDeps>,
): Promise<RetentionPruneResult> {
  const windows = computeRetentionWindows(input);
  const start = new Date();
  const deleteOlderThan = deps?.deleteOlderThan ?? defaultDeleteOlderThan;
  const log = deps?.log ?? ((msg: string, meta?: Record<string, unknown>) => {
    const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
    console.log(`[retention-prune] ${msg}${suffix}`);
  });
  const result: RetentionPruneResult = {
    securityEventsDeleted: 0,
    securityLogsDeleted: 0,
    usageSnapshotsDeleted: 0,
    passwordResetTokensDeleted: 0,
    startedAt: start.toISOString(),
    finishedAt: start.toISOString(),
    durationMs: 0,
    errors: [],
  };

  const steps: Array<{
    key: keyof Pick<RetentionPruneResult, "securityEventsDeleted" | "securityLogsDeleted" | "usageSnapshotsDeleted" | "passwordResetTokensDeleted">;
    table: "security_events" | "security_logs" | "usage_snapshots" | "password_reset_tokens";
    before: Date;
  }> = [
    { key: "securityEventsDeleted", table: "security_events", before: windows.securityEventsBefore },
    { key: "securityLogsDeleted", table: "security_logs", before: windows.securityLogsBefore },
    { key: "usageSnapshotsDeleted", table: "usage_snapshots", before: windows.usageSnapshotsBefore },
    { key: "passwordResetTokensDeleted", table: "password_reset_tokens", before: windows.passwordResetTokensBefore },
  ];

  for (const step of steps) {
    try {
      const deleted = await deleteOlderThan(step.table, step.before);
      result[step.key] = deleted;
      log(`pruned ${step.table}`, { deleted, olderThan: step.before.toISOString() });
    } catch (err) {
      const message = (err as Error)?.message || String(err);
      result.errors.push({ table: step.table, message });
      log(`prune failed: ${step.table}`, { message });
    }
  }

  const end = new Date();
  result.finishedAt = end.toISOString();
  result.durationMs = end.getTime() - start.getTime();
  log("sweep complete", {
    durationMs: result.durationMs,
    securityEventsDeleted: result.securityEventsDeleted,
    securityLogsDeleted: result.securityLogsDeleted,
    usageSnapshotsDeleted: result.usageSnapshotsDeleted,
    passwordResetTokensDeleted: result.passwordResetTokensDeleted,
    errors: result.errors.length,
  });
  return result;
}

async function defaultDeleteOlderThan(
  table: "security_events" | "security_logs" | "usage_snapshots" | "password_reset_tokens",
  before: Date,
): Promise<number> {
  switch (table) {
    case "security_events": {
      const rows = await db.delete(securityEvents).where(lt(securityEvents.createdAt, before)).returning({ id: securityEvents.id });
      return rows.length;
    }
    case "security_logs": {
      const rows = await db.delete(securityLogs).where(lt(securityLogs.createdAt, before)).returning({ id: securityLogs.id });
      return rows.length;
    }
    case "usage_snapshots": {
      const rows = await db.delete(usageSnapshots).where(lt(usageSnapshots.createdAt, before)).returning({ id: usageSnapshots.id });
      return rows.length;
    }
    case "password_reset_tokens": {
      const rows = await db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, before)).returning({ id: passwordResetTokens.id });
      return rows.length;
    }
  }
}

const DEFAULT_TICK_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_INITIAL_DELAY_MS = 2 * 60 * 1000; // 2min, after server boot

export interface RetentionSchedulerOptions {
  intervalMs?: number;
  initialDelayMs?: number;
  windows?: RetentionWindowInput;
  /** Injected so tests can drive the scheduler without touching the DB. */
  run?: (input: RetentionWindowInput) => Promise<RetentionPruneResult>;
}

/**
 * Background daily driver. Wire into server startup (see server/index.ts).
 *
 * Returns a stop function to clear the interval and the initial-delay
 * timer. Safe to call `stop()` before the first tick.
 */
export function startRetentionPruneTicker(options: RetentionSchedulerOptions = {}): () => void {
  const intervalMs = options.intervalMs ?? DEFAULT_TICK_MS;
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const run = options.run ?? ((input: RetentionWindowInput) => runRetentionPrune(input));

  let intervalHandle: ReturnType<typeof setInterval> | null = null;
  const tick = async () => {
    try {
      await run(options.windows ?? {});
    } catch (err) {
      console.warn("[retention-prune] tick failed:", (err as Error)?.message || String(err));
    }
  };

  const initialTimer = setTimeout(() => {
    void tick();
    intervalHandle = setInterval(() => {
      void tick();
    }, intervalMs);
  }, initialDelayMs);

  return () => {
    clearTimeout(initialTimer);
    if (intervalHandle !== null) clearInterval(intervalHandle);
  };
}
