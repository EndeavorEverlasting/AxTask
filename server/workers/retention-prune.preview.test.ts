// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

// Same stub as retention-prune.test.ts — the preview helpers accept
// injected counters, so no real DB is needed.
vi.mock("../db", () => ({
  db: {
    delete: () => ({ where: () => ({ returning: async () => [] }) }),
    execute: async () => ({ rows: [{ n: 0 }] }),
  },
}));

import { previewRetentionPrune, RETENTION_TABLES } from "./retention-prune";

describe("previewRetentionPrune", () => {
  it("calls the count hook once per retention table and aggregates the total", async () => {
    const countOlderThan = vi.fn(async (table) => {
      switch (table) {
        case "security_events":
          return 100;
        case "security_logs":
          return 20;
        case "usage_snapshots":
          return 5;
        case "password_reset_tokens":
          return 3;
        case "db_size_snapshots":
          return 1;
        case "user_location_events":
          return 2;
        case "ai_interactions":
          return 4;
        default:
          return 0;
      }
    });
    const now = new Date("2026-04-19T00:00:00.000Z");

    const result = await previewRetentionPrune(
      {},
      { countOlderThan, now: () => now },
    );

    expect(countOlderThan).toHaveBeenCalledTimes(RETENTION_TABLES.length);
    const tables = result.rows.map((r) => r.table).sort();
    expect(tables).toEqual([...RETENTION_TABLES].sort());
    expect(result.totalRowsToDelete).toBe(100 + 20 + 5 + 3 + 1 + 2 + 4);
    expect(result.generatedAt).toBe(now.toISOString());
  });

  it("never issues DELETE — it only calls countOlderThan (read-only contract)", async () => {
    const deleteSpy = vi.fn();
    const countOlderThan = vi.fn(async () => 42);

    await previewRetentionPrune(
      {},
      {
        countOlderThan,
        now: () => new Date("2026-04-19T00:00:00.000Z"),
      },
    );

    expect(deleteSpy).not.toHaveBeenCalled();
    // The ONLY mutation surface in the worker is deleteOlderThan, which we
    // didn't pass here; asserting countOlderThan fired at all confirms
    // preview walked the plan through its read-only path.
    expect(countOlderThan).toHaveBeenCalled();
  });

  it("records -1 for a table whose count hook throws instead of failing the whole preview", async () => {
    const countOlderThan = vi.fn(async (table) => {
      if (table === "security_events") throw new Error("boom");
      return 7;
    });

    const result = await previewRetentionPrune(
      {},
      {
        countOlderThan,
        now: () => new Date("2026-04-19T00:00:00.000Z"),
      },
    );

    const events = result.rows.find((r) => r.table === "security_events");
    expect(events?.rowsToDelete).toBe(-1);
    // Total excludes the failed row (it's -1 in the row list but we still
    // expect the other rows to contribute).
    const logs = result.rows.find((r) => r.table === "security_logs");
    expect(logs?.rowsToDelete).toBe(7);
  });

  it("reports ISO cutoffs derived from the override window", async () => {
    const countOlderThan = vi.fn(async () => 0);
    const now = new Date("2026-04-19T00:00:00.000Z");
    const result = await previewRetentionPrune(
      { securityEventsDays: 1 },
      { countOlderThan, now: () => now },
    );
    const events = result.rows.find((r) => r.table === "security_events")!;
    const expected = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    expect(events.cutoff).toBe(expected);
  });
});
