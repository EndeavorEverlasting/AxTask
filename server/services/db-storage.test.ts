// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// Stub the DB module so the cache unit tests never try to open a real
// Postgres handle. All real queries in db-storage.ts go through the
// injected `deps` hooks.
vi.mock("../db", () => ({
  db: { execute: vi.fn(async () => ({ rows: [] })) },
}));

import {
  summariseByDomain,
  formatTableRow,
  listTableBytes,
  listDomainRollup,
  listTopUsers,
  clearDbStorageCache,
  computeDomainBytes,
  STORAGE_DOMAINS,
  type TableBytesRow,
} from "./db-storage";

function row(partial: Partial<TableBytesRow> & { tableName: string }): TableBytesRow {
  return {
    domain: "unknown",
    totalBytes: 0,
    tableBytes: 0,
    indexBytes: 0,
    toastBytes: 0,
    liveRows: 0,
    deadRows: 0,
    ...partial,
  };
}

describe("summariseByDomain (pure rollup)", () => {
  it("groups rows by domain and keeps every bucket", () => {
    const out = summariseByDomain([
      row({ tableName: "users", domain: "core", totalBytes: 100, tableBytes: 60, indexBytes: 40, liveRows: 10 }),
      row({ tableName: "tasks", domain: "tasks", totalBytes: 200, tableBytes: 150, indexBytes: 50, liveRows: 5 }),
      row({ tableName: "something", domain: "unknown", totalBytes: 5, tableBytes: 5, indexBytes: 0 }),
    ]);
    expect(out.map((r) => r.domain)).toEqual([...STORAGE_DOMAINS]);
    const core = out.find((r) => r.domain === "core")!;
    expect(core).toMatchObject({ tableCount: 1, totalBytes: 100, tableBytes: 60, indexBytes: 40, liveRows: 10 });
    const gam = out.find((r) => r.domain === "gamification")!;
    expect(gam).toMatchObject({ tableCount: 0, totalBytes: 0 });
    const unknown = out.find((r) => r.domain === "unknown")!;
    expect(unknown).toMatchObject({ tableCount: 1, totalBytes: 5 });
  });

  it("returns empty rollup when no rows are provided", () => {
    const out = summariseByDomain([]);
    expect(out.every((r) => r.tableCount === 0 && r.totalBytes === 0)).toBe(true);
  });
});

describe("formatTableRow", () => {
  it("parses string/bigint byte counts, lowercases table name, assigns domain", () => {
    const out = formatTableRow({
      schemaname: "public",
      relname: "USERS",
      total_bytes: "100",
      table_bytes: BigInt(60),
      index_bytes: 40,
      toast_bytes: null,
      n_live_tup: "5",
      n_dead_tup: "1",
    });
    expect(out.tableName).toBe("users");
    // If "users" lives in the core domain in this repo, we should pick it
    // up reflectively; otherwise it falls back to "unknown". Either way
    // the shape is validated.
    expect(["core", "unknown"]).toContain(out.domain);
    expect(out.totalBytes).toBe(100);
    expect(out.tableBytes).toBe(60);
    expect(out.indexBytes).toBe(40);
    expect(out.toastBytes).toBe(0);
    expect(out.liveRows).toBe(5);
    expect(out.deadRows).toBe(1);
  });

  it("floors negatives/NaN to 0 instead of propagating junk bytes", () => {
    const out = formatTableRow({
      schemaname: "public",
      relname: "x",
      total_bytes: -1,
      table_bytes: Number.NaN as unknown as number,
      index_bytes: "abc",
      toast_bytes: null,
      n_live_tup: -2,
      n_dead_tup: "",
    });
    expect(out.totalBytes).toBe(0);
    expect(out.tableBytes).toBe(0);
    expect(out.indexBytes).toBe(0);
    expect(out.liveRows).toBe(0);
    expect(out.deadRows).toBe(0);
  });
});

describe("computeDomainBytes", () => {
  it("returns a fully populated record so the snapshot writer never writes missing keys", () => {
    const out = computeDomainBytes([
      row({ tableName: "a", domain: "core", totalBytes: 10 }),
      row({ tableName: "b", domain: "tasks", totalBytes: 20 }),
    ]);
    expect(Object.keys(out).sort()).toEqual(["core", "gamification", "ops", "tasks", "unknown"]);
    expect(out.core).toBe(10);
    expect(out.tasks).toBe(20);
    expect(out.gamification).toBe(0);
  });
});

describe("listTableBytes cache", () => {
  beforeEach(() => clearDbStorageCache());

  it("serves from cache on the second call when within cacheMs", async () => {
    const fetchTableBytes = vi.fn(async () => [row({ tableName: "users", domain: "core", totalBytes: 1 })]);
    const now = new Date("2026-04-19T00:00:00.000Z");
    const a = await listTableBytes({ fetchTableBytes, cacheMs: 60_000, now: () => now });
    const b = await listTableBytes({ fetchTableBytes, cacheMs: 60_000, now: () => now });
    expect(fetchTableBytes).toHaveBeenCalledTimes(1);
    expect(a.source).toBe("live");
    expect(b.source).toBe("cache");
    expect(b.rows).toEqual(a.rows);
  });

  it("refetches once the TTL has expired", async () => {
    const fetchTableBytes = vi.fn(async () => [row({ tableName: "users", domain: "core", totalBytes: 1 })]);
    const t0 = new Date("2026-04-19T00:00:00.000Z");
    const t1 = new Date(t0.getTime() + 61_000);
    await listTableBytes({ fetchTableBytes, cacheMs: 60_000, now: () => t0 });
    await listTableBytes({ fetchTableBytes, cacheMs: 60_000, now: () => t1 });
    expect(fetchTableBytes).toHaveBeenCalledTimes(2);
  });
});

describe("listDomainRollup reuses listTableBytes cache", () => {
  beforeEach(() => clearDbStorageCache());

  it("calls the fetcher only once across table + domain reads", async () => {
    const fetchTableBytes = vi.fn(async () => [
      row({ tableName: "users", domain: "core", totalBytes: 10 }),
      row({ tableName: "tasks", domain: "tasks", totalBytes: 20 }),
    ]);
    const now = new Date("2026-04-19T00:00:00.000Z");
    await listTableBytes({ fetchTableBytes, now: () => now });
    const r2 = await listDomainRollup({ fetchTableBytes, now: () => now });
    expect(fetchTableBytes).toHaveBeenCalledTimes(1);
    expect(r2.rollup.find((d) => d.domain === "core")?.totalBytes).toBe(10);
    expect(r2.rollup.find((d) => d.domain === "tasks")?.totalBytes).toBe(20);
  });
});

describe("listTopUsers", () => {
  it("hashes user ids and never returns raw ids in the output rows", async () => {
    const fake = [
      { user_id: "raw-user-aaa", bytes: 100, row_count: 3 },
      { user_id: "raw-user-bbb", bytes: 50, row_count: 1 },
    ];
    const hashUserId = vi.fn((id: string) => `hash(${id.slice(-3)})`);
    const result = await listTopUsers("attachments", 10, {
      fetchTopUsersByAttachments: async () => fake,
      hashUserId,
    });
    expect(result.kind).toBe("attachments");
    expect(result.rows).toEqual([
      { userKey: "hash(aaa)", bytes: 100, rowCount: 3 },
      { userKey: "hash(bbb)", bytes: 50, rowCount: 1 },
    ]);
    for (const r of result.rows) {
      expect(r.userKey).not.toMatch(/raw-user-/);
    }
    expect(hashUserId).toHaveBeenCalledTimes(2);
  });

  it("drops rows with null user_id", async () => {
    const fake = [
      { user_id: null, bytes: 999, row_count: 3 },
      { user_id: "u1", bytes: 100, row_count: 1 },
    ];
    const result = await listTopUsers("tasks", 10, {
      fetchTopUsersByTaskBytes: async () => fake,
      hashUserId: (id) => `h:${id}`,
    });
    expect(result.rows).toEqual([{ userKey: "h:u1", bytes: 100, rowCount: 1 }]);
  });

  it("clamps limit into [1, 100]", async () => {
    let receivedLimit = 0;
    const fetcher = async (limit: number) => {
      receivedLimit = limit;
      return [];
    };
    await listTopUsers("attachments", 999, {
      fetchTopUsersByAttachments: fetcher,
      hashUserId: (x) => x,
    });
    expect(receivedLimit).toBe(100);
    await listTopUsers("attachments", 0, {
      fetchTopUsersByAttachments: fetcher,
      hashUserId: (x) => x,
    });
    expect(receivedLimit).toBe(1);
  });
});
