/**
 * Granular Postgres storage analytics for the Admin > Storage tab.
 *
 * `server/services/db-size.ts` exposes the whole-DB gauge. This module
 * goes a level deeper: per-table bytes (heap + indexes) grouped by the
 * Phase F-1 schema domains (core / tasks / gamification / ops), plus
 * top-N users by attachment / task byte weight. All queries hit only
 * `pg_catalog` views — nothing mutates state.
 *
 * Cached in-memory for 60s to match the existing db-size cadence, so
 * the admin UI can poll every minute without re-running the joins.
 *
 * Pure helpers (`summariseByDomain`, `formatTableRow`) are unit-tested
 * without a live DB; the query wrappers accept injected fetchers so
 * route tests don't need a running Postgres either.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  domainOfTable,
  SCHEMA_DOMAINS,
  type SchemaDomain,
  type SchemaDomainOrUnknown,
} from "./schema-domain-map";

export type StorageDomain = SchemaDomainOrUnknown;
export const STORAGE_DOMAINS: ReadonlyArray<StorageDomain> = Object.freeze([
  ...SCHEMA_DOMAINS,
  "unknown" as const,
]);

export interface TableBytesRow {
  tableName: string;
  domain: StorageDomain;
  totalBytes: number;
  tableBytes: number;
  indexBytes: number;
  toastBytes: number;
  liveRows: number;
  deadRows: number;
}

export interface DomainRollupRow {
  domain: StorageDomain;
  tableCount: number;
  totalBytes: number;
  tableBytes: number;
  indexBytes: number;
  liveRows: number;
}

export interface TopUserRow {
  /** Hashed/truncated user identifier — never the raw userId. */
  userKey: string;
  bytes: number;
  rowCount: number;
}

export type TopUserKind = "attachments" | "tasks";

interface StorageQueryRow {
  schemaname: string;
  relname: string;
  total_bytes: string | number | bigint;
  table_bytes: string | number | bigint;
  index_bytes: string | number | bigint;
  toast_bytes: string | number | bigint | null;
  n_live_tup: string | number | bigint;
  n_dead_tup: string | number | bigint;
}

function toNumber(n: unknown): number {
  if (typeof n === "bigint") return Number(n);
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

/**
 * Pure: roll up a flat list of per-table byte rows into one row per
 * domain. Unknown tables fall into the "unknown" bucket instead of
 * being dropped.
 */
export function summariseByDomain(
  rows: ReadonlyArray<TableBytesRow>,
): DomainRollupRow[] {
  const init: Record<StorageDomain, DomainRollupRow> = {
    core: emptyRollup("core"),
    tasks: emptyRollup("tasks"),
    gamification: emptyRollup("gamification"),
    ops: emptyRollup("ops"),
    unknown: emptyRollup("unknown"),
  };
  for (const r of rows) {
    const bucket = init[r.domain];
    bucket.tableCount += 1;
    bucket.totalBytes += r.totalBytes;
    bucket.tableBytes += r.tableBytes;
    bucket.indexBytes += r.indexBytes;
    bucket.liveRows += r.liveRows;
  }
  return STORAGE_DOMAINS.map((d) => init[d]);
}

function emptyRollup(domain: StorageDomain): DomainRollupRow {
  return {
    domain,
    tableCount: 0,
    totalBytes: 0,
    tableBytes: 0,
    indexBytes: 0,
    liveRows: 0,
  };
}

/**
 * Pure: translate a raw pg_catalog row into our typed shape.
 */
export function formatTableRow(raw: StorageQueryRow): TableBytesRow {
  const tableName = (raw.relname ?? "").toLowerCase();
  return {
    tableName,
    domain: domainOfTable(tableName),
    totalBytes: toNumber(raw.total_bytes),
    tableBytes: toNumber(raw.table_bytes),
    indexBytes: toNumber(raw.index_bytes),
    toastBytes: toNumber(raw.toast_bytes),
    liveRows: toNumber(raw.n_live_tup),
    deadRows: toNumber(raw.n_dead_tup),
  };
}

async function queryTableBytes(): Promise<TableBytesRow[]> {
  const result = await db.execute(sql<StorageQueryRow>`
    SELECT
      s.schemaname,
      s.relname,
      pg_total_relation_size(c.oid)::bigint AS total_bytes,
      pg_table_size(c.oid)::bigint          AS table_bytes,
      pg_indexes_size(c.oid)::bigint        AS index_bytes,
      COALESCE(pg_total_relation_size(c.reltoastrelid), 0)::bigint AS toast_bytes,
      s.n_live_tup,
      s.n_dead_tup
    FROM pg_stat_user_tables s
    JOIN pg_class c ON c.oid = (s.schemaname || '.' || s.relname)::regclass
    WHERE s.schemaname = 'public'
    ORDER BY total_bytes DESC
  `);
  const rows = (result as unknown as { rows?: StorageQueryRow[] }).rows
    ?? (Array.isArray(result) ? (result as StorageQueryRow[]) : []);
  return rows.map(formatTableRow);
}

interface TopUsersQueryRow {
  user_id: string | null;
  bytes: string | number | bigint;
  row_count: string | number | bigint;
}

async function queryTopUsersByAttachments(limit: number): Promise<TopUsersQueryRow[]> {
  const result = await db.execute(sql<TopUsersQueryRow>`
    SELECT
      user_id,
      SUM(byte_size)::bigint AS bytes,
      COUNT(*)::bigint       AS row_count
    FROM attachment_assets
    WHERE user_id IS NOT NULL
    GROUP BY user_id
    ORDER BY bytes DESC NULLS LAST
    LIMIT ${limit}
  `);
  return (result as unknown as { rows?: TopUsersQueryRow[] }).rows
    ?? (Array.isArray(result) ? (result as TopUsersQueryRow[]) : []);
}

async function queryTopUsersByTaskBytes(limit: number): Promise<TopUsersQueryRow[]> {
  // octet_length of the text columns that dominate a task row (notes +
  // activity + prerequisites). classification_associations is jsonb so we
  // compare its serialized size.
  const result = await db.execute(sql<TopUsersQueryRow>`
    SELECT
      user_id,
      SUM(
        COALESCE(octet_length(notes), 0)
        + COALESCE(octet_length(activity), 0)
        + COALESCE(octet_length(prerequisites), 0)
        + COALESCE(octet_length(classification_associations::text), 0)
      )::bigint AS bytes,
      COUNT(*)::bigint AS row_count
    FROM tasks
    WHERE user_id IS NOT NULL
    GROUP BY user_id
    ORDER BY bytes DESC NULLS LAST
    LIMIT ${limit}
  `);
  return (result as unknown as { rows?: TopUsersQueryRow[] }).rows
    ?? (Array.isArray(result) ? (result as TopUsersQueryRow[]) : []);
}

export interface StorageServiceDeps {
  fetchTableBytes?: () => Promise<TableBytesRow[]>;
  fetchTopUsersByAttachments?: (limit: number) => Promise<TopUsersQueryRow[]>;
  fetchTopUsersByTaskBytes?: (limit: number) => Promise<TopUsersQueryRow[]>;
  /** Injected hasher so unit tests can assert raw IDs never leak. */
  hashUserId?: (userId: string) => string;
  cacheMs?: number;
  now?: () => Date;
}

interface TableCacheEntry {
  rows: TableBytesRow[];
  fetchedAt: Date;
}
let tableCache: TableCacheEntry | null = null;
const DEFAULT_CACHE_MS = 60_000;

export function clearDbStorageCache(): void {
  tableCache = null;
}

export interface ListTableBytesResult {
  rows: TableBytesRow[];
  fetchedAt: string;
  source: "live" | "cache";
}

export async function listTableBytes(
  deps: StorageServiceDeps = {},
): Promise<ListTableBytesResult> {
  const cacheMs = deps.cacheMs ?? DEFAULT_CACHE_MS;
  const now = (deps.now ?? (() => new Date()))();
  const fetcher = deps.fetchTableBytes ?? queryTableBytes;

  if (tableCache && now.getTime() - tableCache.fetchedAt.getTime() < cacheMs) {
    return {
      rows: tableCache.rows,
      fetchedAt: tableCache.fetchedAt.toISOString(),
      source: "cache",
    };
  }
  const rows = await fetcher();
  tableCache = { rows, fetchedAt: now };
  return { rows, fetchedAt: now.toISOString(), source: "live" };
}

export interface SummariseResult {
  rollup: DomainRollupRow[];
  fetchedAt: string;
  source: "live" | "cache";
}

export async function listDomainRollup(
  deps: StorageServiceDeps = {},
): Promise<SummariseResult> {
  const { rows, fetchedAt, source } = await listTableBytes(deps);
  return { rollup: summariseByDomain(rows), fetchedAt, source };
}

/**
 * Default per-userId hash: truncate the 8-char prefix of a sha256 hex.
 * Good enough for an admin readout; the real archetype-analytics path
 * uses a salted HMAC, but we don't need de-identification parity here
 * — this surface is admin-only and the short prefix is meant to be a
 * visual key, not a cryptographic identifier.
 */
function defaultHashUserId(userId: string): string {
  // Lazy-require to avoid a top-level crypto import in environments that
  // stub the module (vitest node env provides it, but it keeps this file
  // tree-shake friendly for the rare non-node caller).
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  const digest = createHash("sha256").update(userId).digest("hex");
  return digest.slice(0, 10);
}

export interface ListTopUsersResult {
  kind: TopUserKind;
  rows: TopUserRow[];
  fetchedAt: string;
}

export async function listTopUsers(
  kind: TopUserKind,
  limit: number = 20,
  deps: StorageServiceDeps = {},
): Promise<ListTopUsersResult> {
  const clampedLimit = Math.max(1, Math.min(Math.floor(limit), 100));
  const hash = deps.hashUserId ?? defaultHashUserId;
  const now = (deps.now ?? (() => new Date()))();

  const fetcher =
    kind === "attachments"
      ? deps.fetchTopUsersByAttachments ?? queryTopUsersByAttachments
      : deps.fetchTopUsersByTaskBytes ?? queryTopUsersByTaskBytes;

  const raw = await fetcher(clampedLimit);
  const rows: TopUserRow[] = raw
    .filter((r) => typeof r.user_id === "string" && r.user_id.length > 0)
    .map((r) => ({
      userKey: hash(r.user_id as string),
      bytes: toNumber(r.bytes),
      rowCount: toNumber(r.row_count),
    }));
  return { kind, rows, fetchedAt: now.toISOString() };
}

/**
 * Convenience exported for tests and snapshot workers that want the
 * underlying typed query row (without cache semantics).
 */
export async function fetchTableBytesUncached(): Promise<TableBytesRow[]> {
  return queryTableBytes();
}

/**
 * Aggregate just the byte totals per domain — used by the db-size
 * snapshot worker to write compact rows into `db_size_snapshots`.
 * Returns `{ core, tasks, gamification, ops, unknown }`.
 */
export function computeDomainBytes(
  rows: ReadonlyArray<TableBytesRow>,
): Record<StorageDomain, number> {
  const out: Record<StorageDomain, number> = {
    core: 0,
    tasks: 0,
    gamification: 0,
    ops: 0,
    unknown: 0,
  };
  for (const r of rows) {
    out[r.domain] += r.totalBytes;
  }
  return out;
}

export type { SchemaDomain };
