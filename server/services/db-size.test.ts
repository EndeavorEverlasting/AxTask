import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub the DB module — getDbSizeCached's queryBytes is injectable, so
// no live Postgres is needed for these unit tests.
vi.mock("../db", () => ({
  db: {
    execute: async () => ({ rows: [{ size: "0" }] }),
  },
}));

import {
  DEFAULT_DB_SIZE_BUDGET_BYTES,
  clearDbSizeCache,
  formatDbSize,
  getDbSizeCached,
  humanBytes,
} from "./db-size";

beforeEach(() => {
  clearDbSizeCache();
});

describe("humanBytes", () => {
  it("formats the common units", () => {
    expect(humanBytes(0)).toBe("0 B");
    expect(humanBytes(512)).toBe("512 B");
    expect(humanBytes(1024)).toBe("1.00 KB");
    expect(humanBytes(1_536)).toBe("1.50 KB");
    expect(humanBytes(536_870_912)).toBe("512 MB");
  });

  it("handles bogus inputs", () => {
    expect(humanBytes(-1)).toBe("0 B");
    expect(humanBytes(Number.NaN)).toBe("0 B");
    expect(humanBytes(Infinity)).toBe("0 B");
  });
});

describe("formatDbSize", () => {
  const fetchedAt = new Date("2026-04-19T01:00:00.000Z");

  it("is OK well below budget", () => {
    const r = formatDbSize(100 * 1024 * 1024, DEFAULT_DB_SIZE_BUDGET_BYTES, fetchedAt);
    expect(r.tone).toBe("ok");
    expect(r.pctOfBudget).toBeCloseTo(19.5, 1);
    expect(r.humanBytes).toBe("100 MB");
    expect(r.source).toBe("live");
  });

  it("crosses the warn threshold at 70% (rounded to 0.1%)", () => {
    expect(formatDbSize(Math.floor(DEFAULT_DB_SIZE_BUDGET_BYTES * 0.70)).tone).toBe("warn");
    expect(formatDbSize(Math.floor(DEFAULT_DB_SIZE_BUDGET_BYTES * 0.60)).tone).toBe("ok");
  });

  it("crosses the bad threshold at 85% (rounded to 0.1%)", () => {
    expect(formatDbSize(Math.floor(DEFAULT_DB_SIZE_BUDGET_BYTES * 0.85)).tone).toBe("bad");
    expect(formatDbSize(Math.floor(DEFAULT_DB_SIZE_BUDGET_BYTES * 0.80)).tone).toBe("warn");
  });

  it("coerces negative/NaN bytes to 0 and invalid budget to the default", () => {
    expect(formatDbSize(-100).bytes).toBe(0);
    expect(formatDbSize(Number.NaN).bytes).toBe(0);
    expect(formatDbSize(1024, -1).budgetBytes).toBe(DEFAULT_DB_SIZE_BUDGET_BYTES);
    expect(formatDbSize(1024, 0).budgetBytes).toBe(DEFAULT_DB_SIZE_BUDGET_BYTES);
  });
});

describe("getDbSizeCached", () => {
  it("caches within the window and revalidates after", async () => {
    const queryBytes = vi.fn().mockResolvedValueOnce(100).mockResolvedValueOnce(200);
    let now = new Date("2026-04-19T01:00:00.000Z");

    const first = await getDbSizeCached({ cacheMs: 60_000, queryBytes, now: () => now });
    expect(first.bytes).toBe(100);
    expect(first.source).toBe("live");
    expect(queryBytes).toHaveBeenCalledTimes(1);

    now = new Date(now.getTime() + 30_000);
    const cached = await getDbSizeCached({ cacheMs: 60_000, queryBytes, now: () => now });
    expect(cached.bytes).toBe(100);
    expect(cached.source).toBe("cache");
    expect(queryBytes).toHaveBeenCalledTimes(1);

    now = new Date(now.getTime() + 60_000);
    const revalidated = await getDbSizeCached({ cacheMs: 60_000, queryBytes, now: () => now });
    expect(revalidated.bytes).toBe(200);
    expect(revalidated.source).toBe("live");
    expect(queryBytes).toHaveBeenCalledTimes(2);
  });

  it("respects per-call budget override", async () => {
    const queryBytes = vi.fn().mockResolvedValue(100 * 1024 * 1024);
    const tightBudget = 128 * 1024 * 1024;
    const r = await getDbSizeCached({ queryBytes, budgetBytes: tightBudget });
    expect(r.pctOfBudget).toBeCloseTo(78.1, 0);
    expect(r.tone).toBe("warn");
  });
});
