// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("../db", () => ({
  db: {
    execute: vi.fn(async () => ({ rows: [] })),
    insert: () => ({ values: vi.fn(async () => undefined) }),
  },
}));

import { captureDbSizeSnapshot, shouldCaptureSnapshot } from "./db-size-snapshot";
import type { StorageDomain } from "../services/db-storage";

function emptyDomains(): Record<StorageDomain, number> {
  return { core: 0, tasks: 0, gamification: 0, ops: 0, unknown: 0 };
}

describe("shouldCaptureSnapshot (pure)", () => {
  it("captures when there is no previous snapshot", () => {
    expect(shouldCaptureSnapshot(new Date("2026-04-19T12:00:00Z"), null)).toBe(true);
  });

  it("skips if the last capture is the same UTC day", () => {
    expect(
      shouldCaptureSnapshot(
        new Date("2026-04-19T23:59:59Z"),
        new Date("2026-04-19T00:00:00Z"),
      ),
    ).toBe(false);
  });

  it("captures once the calendar day advances", () => {
    expect(
      shouldCaptureSnapshot(
        new Date("2026-04-20T00:00:01Z"),
        new Date("2026-04-19T23:59:59Z"),
      ),
    ).toBe(true);
  });
});

describe("captureDbSizeSnapshot", () => {
  it("is a no-op when today's snapshot already exists", async () => {
    const insertSnapshot = vi.fn(async () => {});
    const result = await captureDbSizeSnapshot({
      hasSnapshotForDay: async () => true,
      queryDbSizeBytes: async () => 1_000,
      queryDomainBytes: async () => emptyDomains(),
      insertSnapshot,
      now: () => new Date("2026-04-19T00:00:00Z"),
      log: () => {},
    });
    expect(result.inserted).toBe(false);
    expect(result.reason).toBe("already-captured-today");
    expect(insertSnapshot).not.toHaveBeenCalled();
  });

  it("writes one row with db size + domain rollup when no snapshot exists yet", async () => {
    const insertSnapshot = vi.fn(async () => {});
    const result = await captureDbSizeSnapshot({
      hasSnapshotForDay: async () => false,
      queryDbSizeBytes: async () => 42,
      queryDomainBytes: async () => ({ ...emptyDomains(), core: 10, tasks: 20 }),
      insertSnapshot,
      now: () => new Date("2026-04-19T00:00:00Z"),
      log: () => {},
    });
    expect(result.inserted).toBe(true);
    expect(result.dbSizeBytes).toBe(42);
    expect(insertSnapshot).toHaveBeenCalledOnce();
    const arg = insertSnapshot.mock.calls[0][0];
    expect(arg.dbSizeBytes).toBe(42);
    expect(arg.domainBytes.core).toBe(10);
    expect(arg.domainBytes.tasks).toBe(20);
  });

  it("returns a structured write-error instead of throwing when the DB blows up", async () => {
    const insertSnapshot = vi.fn(async () => {
      throw new Error("connection refused");
    });
    const result = await captureDbSizeSnapshot({
      hasSnapshotForDay: async () => false,
      queryDbSizeBytes: async () => 100,
      queryDomainBytes: async () => emptyDomains(),
      insertSnapshot,
      now: () => new Date("2026-04-19T00:00:00Z"),
      log: () => {},
    });
    expect(result.inserted).toBe(false);
    expect(result.reason).toBe("write-error");
    expect(result.error).toBe("connection refused");
  });
});
