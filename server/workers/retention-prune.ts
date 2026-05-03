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
import { lt, sql } from "drizzle-orm";
import { db } from "../db";
import {
  securityEvents,
  securityLogs,
  usageSnapshots,
  passwordResetTokens,
  dbSizeSnapshots,
  userLocationEvents,
  aiInteractions,
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
  /** db_size_snapshots are 1-row-per-day Postgres-disk captures powering
   *  the Admin > Storage trend. 365 days is one year of history; older
   *  points would overfill the chart and the table trivially. */
  dbSizeSnapshotsDays: 365,
  /** user_location_events are enter/exit telemetry; short window is enough
   *  for geofence debugging (see docs/DB_RETENTION_POLICY.md). */
  userLocationEventsDays: 90,
  /** ai_interactions may contain raw user text; keep a tight window. */
  aiInteractionsDays: 30,
} as const;

export interface RetentionWindowInput {
  securityEventsDays?: number;
  securityLogsDays?: number;
  usageSnapshotsDays?: number;
  passwordResetTokensDays?: number;
  dbSizeSnapshotsDays?: number;
  userLocationEventsDays?: number;
  aiInteractionsDays?: number;
}

export interface RetentionWindows {
  securityEventsBefore: Date;
  securityLogsBefore: Date;
  usageSnapshotsBefore: Date;
  passwordResetTokensBefore: Date;
  dbSizeSnapshotsBefore: Date;
  userLocationEventsBefore: Date;
  aiInteractionsBefore: Date;
}

export type RetentionTable =
  | "security_events"
  | "security_logs"
  | "usage_snapshots"
  | "password_reset_tokens"
  | "db_size_snapshots"
  | "user_location_events"
  | "ai_interactions";

export const RETENTION_TABLES: ReadonlyArray<RetentionTable> = Object.freeze([
  "security_events",
  "security_logs",
  "usage_snapshots",
  "password_reset_tokens",
  "db_size_snapshots",
  "user_location_events",
  "ai_interactions",
]);

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
    dbSizeSnapshotsDays: clamp(input.dbSizeSnapshotsDays, DEFAULT_RETENTION_WINDOWS.dbSizeSnapshotsDays),
    userLocationEventsDays: clamp(input.userLocationEventsDays, DEFAULT_RETENTION_WINDOWS.userLocationEventsDays),
    aiInteractionsDays: clamp(input.aiInteractionsDays, DEFAULT_RETENTION_WINDOWS.aiInteractionsDays),
  };
  const day = 24 * 60 * 60 * 1000;
  return {
    securityEventsBefore: new Date(now.getTime() - d.securityEventsDays * day),
    securityLogsBefore: new Date(now.getTime() - d.securityLogsDays * day),
    usageSnapshotsBefore: new Date(now.getTime() - d.usageSnapshotsDays * day),
    passwordResetTokensBefore: new Date(now.getTime() - d.passwordResetTokensDays * day),
    dbSizeSnapshotsBefore: new Date(now.getTime() - d.dbSizeSnapshotsDays * day),
    userLocationEventsBefore: new Date(now.getTime() - d.userLocationEventsDays * day),
    aiInteractionsBefore: new Date(now.getTime() - d.aiInteractionsDays * day),
  };
}

export interface RetentionPruneResult {
  securityEventsDeleted: number;
  securityLogsDeleted: number;
  usageSnapshotsDeleted: number;
  passwordResetTokensDeleted: number;
  dbSizeSnapshotsDeleted: number;
  userLocationEventsDeleted: number;
  aiInteractionsDeleted: number;
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
  deleteOlderThan: (table: RetentionTable, before: Date) => Promise<number>;
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
    dbSizeSnapshotsDeleted: 0,
    userLocationEventsDeleted: 0,
    aiInteractionsDeleted: 0,
    startedAt: start.toISOString(),
    finishedAt: start.toISOString(),
    durationMs: 0,
    errors: [],
  };

  const steps: Array<{
    key: keyof Pick<
      RetentionPruneResult,
      | "securityEventsDeleted"
      | "securityLogsDeleted"
      | "usageSnapshotsDeleted"
      | "passwordResetTokensDeleted"
      | "dbSizeSnapshotsDeleted"
      | "userLocationEventsDeleted"
      | "aiInteractionsDeleted"
    >;
    table: RetentionTable;
    before: Date;
  }> = [
    { key: "securityEventsDeleted", table: "security_events", before: windows.securityEventsBefore },
    { key: "securityLogsDeleted", table: "security_logs", before: windows.securityLogsBefore },
    { key: "usageSnapshotsDeleted", table: "usage_snapshots", before: windows.usageSnapshotsBefore },
    { key: "passwordResetTokensDeleted", table: "password_reset_tokens", before: windows.passwordResetTokensBefore },
    { key: "dbSizeSnapshotsDeleted", table: "db_size_snapshots", before: windows.dbSizeSnapshotsBefore },
    { key: "userLocationEventsDeleted", table: "user_location_events", before: windows.userLocationEventsBefore },
    { key: "aiInteractionsDeleted", table: "ai_interactions", before: windows.aiInteractionsBefore },
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
    dbSizeSnapshotsDeleted: result.dbSizeSnapshotsDeleted,
    userLocationEventsDeleted: result.userLocationEventsDeleted,
    aiInteractionsDeleted: result.aiInteractionsDeleted,
    errors: result.errors.length,
  });
  return result;
}

/**
 * Alias for `runRetentionPrune` that's exported by a more descriptive
 * name for the admin "Run prune now" route. The admin route audits the
 * return value, so we keep the same shape.
 */
export async function runRetentionPruneOnce(
  input: RetentionWindowInput = {},
  deps?: Partial<RetentionPruneDeps>,
): Promise<RetentionPruneResult> {
  return runRetentionPrune(input, deps);
}

async function defaultDeleteOlderThan(
  table: RetentionTable,
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
    case "db_size_snapshots": {
      const rows = await db.delete(dbSizeSnapshots).where(lt(dbSizeSnapshots.capturedAt, before)).returning({ id: dbSizeSnapshots.id });
      return rows.length;
    }
    case "user_location_events": {
      const rows = await db
        .delete(userLocationEvents)
        .where(lt(userLocationEvents.createdAt, before))
        .returning({ id: userLocationEvents.id });
      return rows.length;
    }
    case "ai_interactions": {
      const rows = await db
        .delete(aiInteractions)
        .where(lt(aiInteractions.createdAt, before))
        .returning({ id: aiInteractions.id });
      return rows.length;
    }
  }
}

// ─── Dry-run preview ──────────────────────────────────────────────────

export interface RetentionPreviewRow {
  table: RetentionTable;
  cutoff: string;
  rowsToDelete: number;
}

export interface RetentionPreviewResult {
  rows: RetentionPreviewRow[];
  totalRowsToDelete: number;
  generatedAt: string;
}

export interface RetentionPreviewDeps {
  countOlderThan?: (table: RetentionTable, before: Date) => Promise<number>;
  now?: () => Date;
}

/**
 * Dry-run: count rows each retention step *would* delete right now,
 * without issuing any DELETE. Safe to expose over HTTP as a GET since
 * it only runs SELECT COUNT(*) against each retention table.
 */
export async function previewRetentionPrune(
  input: RetentionWindowInput = {},
  deps: RetentionPreviewDeps = {},
): Promise<RetentionPreviewResult> {
  const now = (deps.now ?? (() => new Date()))();
  const windows = computeRetentionWindows(input, now);
  const count = deps.countOlderThan ?? defaultCountOlderThan;

  const plan: Array<{ table: RetentionTable; before: Date }> = [
    { table: "security_events", before: windows.securityEventsBefore },
    { table: "security_logs", before: windows.securityLogsBefore },
    { table: "usage_snapshots", before: windows.usageSnapshotsBefore },
    { table: "password_reset_tokens", before: windows.passwordResetTokensBefore },
    { table: "db_size_snapshots", before: windows.dbSizeSnapshotsBefore },
    { table: "user_location_events", before: windows.userLocationEventsBefore },
    { table: "ai_interactions", before: windows.aiInteractionsBefore },
  ];

  const rows: RetentionPreviewRow[] = [];
  let total = 0;
  for (const step of plan) {
    try {
      const n = await count(step.table, step.before);
      rows.push({ table: step.table, cutoff: step.before.toISOString(), rowsToDelete: n });
      total += n;
    } catch (err) {
      // Don't throw — return -1 to signal "unknown" for this row and
      // carry on. The admin UI renders a dash for negative values.
      const message = (err as Error)?.message || String(err);
      console.warn(`[retention-prune] preview failed for ${step.table}:`, message);
      rows.push({ table: step.table, cutoff: step.before.toISOString(), rowsToDelete: -1 });
    }
  }
  return { rows, totalRowsToDelete: total, generatedAt: now.toISOString() };
}

async function defaultCountOlderThan(
  table: RetentionTable,
  before: Date,
): Promise<number> {
  const columnExpr = table === "password_reset_tokens"
    ? sql.raw("expires_at")
    : table === "db_size_snapshots"
      ? sql.raw("captured_at")
      : sql.raw("created_at");
  const result = await db.execute(
    sql`SELECT COUNT(*)::bigint AS n FROM ${sql.raw(table)} WHERE ${columnExpr} < ${before.toISOString()}`,
  );
  const rows = (result as unknown as { rows?: Array<{ n?: string | number | bigint }> }).rows
    ?? (Array.isArray(result) ? (result as Array<{ n?: string | number | bigint }>) : []);
  const raw = rows[0]?.n ?? 0;
  const n = typeof raw === "bigint" ? Number(raw) : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
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
