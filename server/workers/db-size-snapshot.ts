/**
 * DB-size snapshot writer.
 *
 * Runs piggy-backed on the retention-prune ticker: once per 24h we
 * capture `pg_database_size(current_database())` and the per-domain
 * rollup (core / tasks / gamification / ops / unknown) into
 * `db_size_snapshots` so the Admin > Storage trend can render a chart
 * without polling live metrics every view.
 *
 * The writer is dedup-protected: if a snapshot with the same
 * `date_trunc('day', captured_at)` already exists, we skip the insert
 * (idempotent re-runs, operator-triggered re-sweeps, restarts all
 * converge on exactly one row per calendar day).
 *
 * Pure helpers (`shouldCaptureSnapshot`) are unit-tested; the DB
 * interaction is injectable so the unit tests don't need a live Postgres.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { dbSizeSnapshots } from "@shared/schema";
import {
  fetchTableBytesUncached,
  computeDomainBytes,
  type StorageDomain,
} from "../services/db-storage";

export interface SnapshotInput {
  dbSizeBytes: number;
  domainBytes: Record<StorageDomain, number>;
  capturedAt: Date;
}

export interface SnapshotWriteResult {
  inserted: boolean;
  reason?: "already-captured-today" | "write-error";
  error?: string;
  capturedAt: string;
  dbSizeBytes: number;
}

export interface SnapshotDeps {
  /** Override for tests: query DB size bytes (total). */
  queryDbSizeBytes?: () => Promise<number>;
  /** Override for tests: per-table bytes (we compute domain rollup). */
  queryDomainBytes?: () => Promise<Record<StorageDomain, number>>;
  /** Override for tests: check whether today already has a snapshot. */
  hasSnapshotForDay?: (day: Date) => Promise<boolean>;
  /** Override for tests: write the row. */
  insertSnapshot?: (row: SnapshotInput) => Promise<void>;
  now?: () => Date;
  log?: (message: string, meta?: Record<string, unknown>) => void;
}

async function defaultQueryDbSizeBytes(): Promise<number> {
  const result = await db.execute(
    sql<{ size: string }>`SELECT pg_database_size(current_database())::bigint AS size`,
  );
  const rows = (result as unknown as { rows?: Array<{ size?: string | number | bigint }> }).rows
    ?? (Array.isArray(result) ? (result as Array<{ size?: string | number | bigint }>) : []);
  const raw = rows[0]?.size ?? 0;
  const n = typeof raw === "bigint" ? Number(raw) : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function defaultQueryDomainBytes(): Promise<Record<StorageDomain, number>> {
  const rows = await fetchTableBytesUncached();
  return computeDomainBytes(rows);
}

async function defaultHasSnapshotForDay(day: Date): Promise<boolean> {
  const iso = day.toISOString().slice(0, 10); // YYYY-MM-DD
  const result = await db.execute(
    sql<{ n: string }>`
      SELECT 1 AS n
      FROM db_size_snapshots
      WHERE date_trunc('day', captured_at) = ${iso}::date
      LIMIT 1
    `,
  );
  const found = (result as unknown as { rows?: unknown[] }).rows
    ?? (Array.isArray(result) ? (result as unknown[]) : []);
  return found.length > 0;
}

async function defaultInsertSnapshot(row: SnapshotInput): Promise<void> {
  await db.insert(dbSizeSnapshots).values({
    capturedAt: row.capturedAt,
    dbSizeBytes: row.dbSizeBytes,
    domainBytesJson: row.domainBytes as Record<string, number>,
  });
}

/**
 * Pure: decide whether we should emit a snapshot now, given an existing
 * "most recent captured_at". Returns `true` only when we've crossed a
 * calendar day boundary (UTC). Used by the unit tests to exercise the
 * once-per-day invariant without touching the DB.
 */
export function shouldCaptureSnapshot(
  now: Date,
  lastCapturedAt: Date | null,
): boolean {
  if (!lastCapturedAt) return true;
  const sameDay =
    now.getUTCFullYear() === lastCapturedAt.getUTCFullYear() &&
    now.getUTCMonth() === lastCapturedAt.getUTCMonth() &&
    now.getUTCDate() === lastCapturedAt.getUTCDate();
  return !sameDay;
}

/**
 * Capture one snapshot. No-op (returns `inserted: false`) if today
 * already has a snapshot, so callers can invoke this safely on every
 * retention-prune tick.
 */
export async function captureDbSizeSnapshot(
  deps: SnapshotDeps = {},
): Promise<SnapshotWriteResult> {
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? ((msg: string, meta?: Record<string, unknown>) => {
    const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
    console.log(`[db-size-snapshot] ${msg}${suffix}`);
  });
  const hasToday = deps.hasSnapshotForDay ?? defaultHasSnapshotForDay;
  const queryDbSize = deps.queryDbSizeBytes ?? defaultQueryDbSizeBytes;
  const queryDomains = deps.queryDomainBytes ?? defaultQueryDomainBytes;
  const insert = deps.insertSnapshot ?? defaultInsertSnapshot;

  try {
    if (await hasToday(now)) {
      log("already captured today, skipping", { capturedAt: now.toISOString() });
      return {
        inserted: false,
        reason: "already-captured-today",
        capturedAt: now.toISOString(),
        dbSizeBytes: 0,
      };
    }
    const [dbSizeBytes, domainBytes] = await Promise.all([
      queryDbSize(),
      queryDomains(),
    ]);
    await insert({ dbSizeBytes, domainBytes, capturedAt: now });
    log("captured", { dbSizeBytes, domainBytes });
    return {
      inserted: true,
      capturedAt: now.toISOString(),
      dbSizeBytes,
    };
  } catch (err) {
    const message = (err as Error)?.message || String(err);
    log("capture failed", { error: message });
    return {
      inserted: false,
      reason: "write-error",
      error: message,
      capturedAt: now.toISOString(),
      dbSizeBytes: 0,
    };
  }
}

export interface SnapshotHistoryRow {
  capturedAt: string;
  dbSizeBytes: number;
  domainBytes: Record<StorageDomain, number>;
}

/**
 * Read-side: pull the last N days of snapshots for the trend chart.
 * Bounded by the retention window so nothing unbounded can come back.
 */
export async function listDbSizeHistory(
  days: number = 30,
): Promise<SnapshotHistoryRow[]> {
  const clamped = Math.max(1, Math.min(Math.floor(days), 365));
  const cutoff = new Date(Date.now() - clamped * 24 * 60 * 60 * 1000);
  const result = await db.execute(
    sql<{ captured_at: string; db_size_bytes: string | number | bigint; domain_bytes_json: unknown }>`
      SELECT captured_at, db_size_bytes, domain_bytes_json
      FROM db_size_snapshots
      WHERE captured_at >= ${cutoff.toISOString()}
      ORDER BY captured_at ASC
    `,
  );
  const rows = (result as unknown as {
    rows?: Array<{ captured_at: string; db_size_bytes: string | number | bigint; domain_bytes_json: unknown }>;
  }).rows
    ?? (Array.isArray(result) ? (result as Array<{ captured_at: string; db_size_bytes: string | number | bigint; domain_bytes_json: unknown }>) : []);
  return rows.map((r) => ({
    capturedAt: new Date(r.captured_at).toISOString(),
    dbSizeBytes: typeof r.db_size_bytes === "bigint" ? Number(r.db_size_bytes) : Number(r.db_size_bytes),
    domainBytes: normalizeDomainBytes(r.domain_bytes_json),
  }));
}

function normalizeDomainBytes(raw: unknown): Record<StorageDomain, number> {
  const out: Record<StorageDomain, number> = {
    core: 0,
    tasks: 0,
    gamification: 0,
    ops: 0,
    unknown: 0,
  };
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of Object.keys(out) as StorageDomain[]) {
      const v = Number(obj[key] ?? 0);
      out[key] = Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
    }
  }
  return out;
}
