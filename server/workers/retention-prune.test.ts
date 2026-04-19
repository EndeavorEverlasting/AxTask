import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Stub the DB module so this file doesn't require a live Postgres for
// unit tests — all DB interaction in this worker is injectable via the
// `deps.deleteOlderThan` hook.
vi.mock("../db", () => ({
  db: {
    delete: () => ({ where: () => ({ returning: async () => [] }) }),
  },
}));

import {
  computeRetentionWindows,
  DEFAULT_RETENTION_WINDOWS,
  runRetentionPrune,
  startRetentionPruneTicker,
} from "./retention-prune";

describe("computeRetentionWindows", () => {
  const now = new Date("2026-04-19T00:00:00.000Z");

  it("falls back to defaults on empty input", () => {
    const w = computeRetentionWindows({}, now);
    const day = 24 * 60 * 60 * 1000;
    expect(w.securityEventsBefore.getTime()).toBe(now.getTime() - DEFAULT_RETENTION_WINDOWS.securityEventsDays * day);
    expect(w.securityLogsBefore.getTime()).toBe(now.getTime() - DEFAULT_RETENTION_WINDOWS.securityLogsDays * day);
    expect(w.usageSnapshotsBefore.getTime()).toBe(now.getTime() - DEFAULT_RETENTION_WINDOWS.usageSnapshotsDays * day);
    expect(w.passwordResetTokensBefore.getTime()).toBe(now.getTime() - DEFAULT_RETENTION_WINDOWS.passwordResetTokensDays * day);
  });

  it("honors per-table overrides", () => {
    const w = computeRetentionWindows(
      { securityEventsDays: 7, usageSnapshotsDays: 14 },
      now,
    );
    const day = 24 * 60 * 60 * 1000;
    expect(w.securityEventsBefore.getTime()).toBe(now.getTime() - 7 * day);
    expect(w.usageSnapshotsBefore.getTime()).toBe(now.getTime() - 14 * day);
    expect(w.securityLogsBefore.getTime()).toBe(now.getTime() - DEFAULT_RETENTION_WINDOWS.securityLogsDays * day);
  });

  it("rejects bogus values and falls back to defaults (never expands the window)", () => {
    const w = computeRetentionWindows(
      {
        securityEventsDays: -5,
        securityLogsDays: 0,
        usageSnapshotsDays: Number.NaN,
        passwordResetTokensDays: Infinity,
      },
      now,
    );
    const day = 24 * 60 * 60 * 1000;
    expect(w.securityEventsBefore.getTime()).toBe(now.getTime() - DEFAULT_RETENTION_WINDOWS.securityEventsDays * day);
    expect(w.securityLogsBefore.getTime()).toBe(now.getTime() - DEFAULT_RETENTION_WINDOWS.securityLogsDays * day);
    expect(w.usageSnapshotsBefore.getTime()).toBe(now.getTime() - DEFAULT_RETENTION_WINDOWS.usageSnapshotsDays * day);
    expect(w.passwordResetTokensBefore.getTime()).toBe(now.getTime() - DEFAULT_RETENTION_WINDOWS.passwordResetTokensDays * day);
  });

  it("floors non-integer day counts (so windows never grow silently)", () => {
    const w = computeRetentionWindows({ securityEventsDays: 30.9 }, now);
    const day = 24 * 60 * 60 * 1000;
    expect(w.securityEventsBefore.getTime()).toBe(now.getTime() - 30 * day);
  });
});

describe("runRetentionPrune", () => {
  it("calls deleteOlderThan exactly once per table and aggregates the counts", async () => {
    const calls: Array<{ table: string; before: Date }> = [];
    const deleteOlderThan = vi.fn(async (table, before) => {
      calls.push({ table, before });
      return table === "security_events" ? 123 : table === "security_logs" ? 4 : table === "usage_snapshots" ? 7 : 2;
    });

    const result = await runRetentionPrune({}, { deleteOlderThan, log: () => {} });

    expect(deleteOlderThan).toHaveBeenCalledTimes(4);
    expect(calls.map((c) => c.table).sort()).toEqual([
      "password_reset_tokens",
      "security_events",
      "security_logs",
      "usage_snapshots",
    ]);
    expect(result.securityEventsDeleted).toBe(123);
    expect(result.securityLogsDeleted).toBe(4);
    expect(result.usageSnapshotsDeleted).toBe(7);
    expect(result.passwordResetTokensDeleted).toBe(2);
    expect(result.errors).toEqual([]);
  });

  it("captures per-table errors instead of throwing (one broken table must not block the others)", async () => {
    const deleteOlderThan = vi.fn(async (table) => {
      if (table === "security_events") throw new Error("boom: permission denied");
      if (table === "security_logs") return 12;
      if (table === "usage_snapshots") return 0;
      return 1;
    });
    const logs: Array<{ msg: string; meta?: Record<string, unknown> }> = [];
    const result = await runRetentionPrune({}, {
      deleteOlderThan,
      log: (msg, meta) => logs.push({ msg, meta }),
    });
    expect(result.securityEventsDeleted).toBe(0);
    expect(result.securityLogsDeleted).toBe(12);
    expect(result.errors).toEqual([
      { table: "security_events", message: "boom: permission denied" },
    ]);
    expect(logs.some((l) => /prune failed: security_events/.test(l.msg))).toBe(true);
  });

  it("records a non-negative durationMs and ISO timestamps", async () => {
    const deleteOlderThan = vi.fn(async () => 0);
    const result = await runRetentionPrune({}, { deleteOlderThan, log: () => {} });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(new Date(result.startedAt).toString()).not.toBe("Invalid Date");
    expect(new Date(result.finishedAt).toString()).not.toBe("Invalid Date");
    expect(new Date(result.finishedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(result.startedAt).getTime(),
    );
  });
});

describe("startRetentionPruneTicker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not fire before the initial delay", () => {
    const run = vi.fn(async () => ({
      securityEventsDeleted: 0,
      securityLogsDeleted: 0,
      usageSnapshotsDeleted: 0,
      passwordResetTokensDeleted: 0,
      startedAt: "", finishedAt: "", durationMs: 0, errors: [],
    }));
    const stop = startRetentionPruneTicker({ intervalMs: 1000, initialDelayMs: 500, run });
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(499);
    expect(run).not.toHaveBeenCalled();
    stop();
  });

  it("fires once after initial delay then on every interval", async () => {
    const run = vi.fn(async () => ({
      securityEventsDeleted: 0,
      securityLogsDeleted: 0,
      usageSnapshotsDeleted: 0,
      passwordResetTokensDeleted: 0,
      startedAt: "", finishedAt: "", durationMs: 0, errors: [],
    }));
    const stop = startRetentionPruneTicker({ intervalMs: 1000, initialDelayMs: 100, run });
    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(run).toHaveBeenCalledTimes(5);
    stop();
  });

  it("swallows run errors so a failing tick does not kill the scheduler", async () => {
    const run = vi.fn(async () => { throw new Error("retention-prune: transient DB issue"); });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stop = startRetentionPruneTicker({ intervalMs: 1000, initialDelayMs: 10, run });
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();
    stop();
    warn.mockRestore();
  });

  it("stop() is idempotent and halts pending ticks", async () => {
    const run = vi.fn(async () => ({
      securityEventsDeleted: 0,
      securityLogsDeleted: 0,
      usageSnapshotsDeleted: 0,
      passwordResetTokensDeleted: 0,
      startedAt: "", finishedAt: "", durationMs: 0, errors: [],
    }));
    const stop = startRetentionPruneTicker({ intervalMs: 1000, initialDelayMs: 50, run });
    stop();
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).not.toHaveBeenCalled();
  });
});
