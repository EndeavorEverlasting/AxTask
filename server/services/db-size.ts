/**
 * Neon / Postgres size observation for the Admin > Performance tab.
 *
 * Phase J added a pre-migration capacity gate so a push-to-ship can't
 * silently blow the 512 MB ceiling (Postgres 53100,
 * neon.max_cluster_size). This module exposes the same number to
 * operators in the running app: the size is cached for 60s so the
 * endpoint is cheap enough to be polled from the admin UI on a short
 * interval.
 *
 * Pure helpers (`formatDbSize`) are unit-tested. The cache wrapper is
 * tested with a stubbed query function so tests don't need a live DB.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";

export const DEFAULT_DB_SIZE_BUDGET_BYTES = 536_870_912; // 512 MB (Neon free-tier ceiling)

export type DbSizeTone = "ok" | "warn" | "bad";

export interface DbSizeReport {
  bytes: number;
  humanBytes: string;
  budgetBytes: number;
  pctOfBudget: number;
  tone: DbSizeTone;
  fetchedAt: string;
  source: "live" | "cache";
}

export function humanBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  // Whole-byte counts don't need decimals; above that, scale precision.
  if (i === 0) return `${Math.round(v)} ${units[i]}`;
  const precision = v < 10 ? 2 : v < 100 ? 1 : 0;
  return `${v.toFixed(precision)} ${units[i]}`;
}

function toneForPct(pct: number): DbSizeTone {
  if (pct >= 85) return "bad";
  if (pct >= 70) return "warn";
  return "ok";
}

/**
 * Pure: derive the full report from a raw byte count. Separated from
 * the cache wrapper so it can be unit-tested without mocking timers.
 */
export function formatDbSize(
  bytes: number,
  budgetBytes: number = DEFAULT_DB_SIZE_BUDGET_BYTES,
  fetchedAt: Date = new Date(),
  source: "live" | "cache" = "live",
): DbSizeReport {
  const safeBytes = Number.isFinite(bytes) && bytes >= 0 ? Math.floor(bytes) : 0;
  const safeBudget = Number.isFinite(budgetBytes) && budgetBytes > 0 ? Math.floor(budgetBytes) : DEFAULT_DB_SIZE_BUDGET_BYTES;
  const pct = Math.round((1000 * safeBytes) / safeBudget) / 10;
  return {
    bytes: safeBytes,
    humanBytes: humanBytes(safeBytes),
    budgetBytes: safeBudget,
    pctOfBudget: pct,
    tone: toneForPct(pct),
    fetchedAt: fetchedAt.toISOString(),
    source,
  };
}

function parseBudget(): number {
  const raw = process.env.AXTASK_DB_SIZE_BUDGET_BYTES;
  if (!raw) return DEFAULT_DB_SIZE_BUDGET_BYTES;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DB_SIZE_BUDGET_BYTES;
  return Math.floor(n);
}

interface CacheEntry {
  bytes: number;
  fetchedAt: Date;
}
let cache: CacheEntry | null = null;
const DEFAULT_CACHE_MS = 60_000;

export function clearDbSizeCache(): void {
  cache = null;
}

/**
 * Query the live size. Injectable so tests can avoid the real DB.
 */
async function queryDbSizeBytes(): Promise<number> {
  const result = await db.execute(sql<{ size: string }>`SELECT pg_database_size(current_database()) AS size`);
  const rows = (result as unknown as { rows?: Array<{ size?: string | number | bigint }> }).rows
    ?? (Array.isArray(result) ? (result as Array<{ size?: string | number | bigint }>) : []);
  const raw = rows[0]?.size ?? 0;
  const n = typeof raw === "bigint" ? Number(raw) : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export interface GetDbSizeCachedOptions {
  cacheMs?: number;
  budgetBytes?: number;
  queryBytes?: () => Promise<number>;
  now?: () => Date;
}

/**
 * Returns a 60-second-cached DB size report. Safe to call from every
 * admin UI poll.
 */
export async function getDbSizeCached(options: GetDbSizeCachedOptions = {}): Promise<DbSizeReport> {
  const cacheMs = options.cacheMs ?? DEFAULT_CACHE_MS;
  const budget = options.budgetBytes ?? parseBudget();
  const queryBytes = options.queryBytes ?? queryDbSizeBytes;
  const now = (options.now ?? (() => new Date()))();

  if (cache && now.getTime() - cache.fetchedAt.getTime() < cacheMs) {
    return formatDbSize(cache.bytes, budget, cache.fetchedAt, "cache");
  }

  const bytes = await queryBytes();
  cache = { bytes, fetchedAt: now };
  return formatDbSize(bytes, budget, now, "live");
}
