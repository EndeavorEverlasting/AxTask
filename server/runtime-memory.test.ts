import { describe, expect, it, vi } from "vitest";
import {
  detectMemoryPressure,
  logMemorySnapshot,
  readMemorySnapshot,
  withMemoryTelemetry,
  type MemorySnapshot,
  type MemoryTelemetryRecord,
} from "./runtime-memory";

const ONE_MIB = 1024 * 1024;

function snapshot(
  rssMiB: number,
  heapUsedMiB: number,
  options: {
    heapTotalMiB?: number;
    heapLimitMiB?: number;
    externalMiB?: number;
    arrayBuffersMiB?: number;
  } = {},
): MemorySnapshot {
  const heapLimitMiB = options.heapLimitMiB ?? 100;
  return {
    rssMiB,
    heapUsedMiB,
    heapTotalMiB: options.heapTotalMiB ?? 60,
    heapLimitMiB,
    heapUsedPercentOfLimit:
      heapLimitMiB > 0 ? Math.round((heapUsedMiB / heapLimitMiB) * 10_000) / 100 : 0,
    externalMiB: options.externalMiB ?? 3,
    arrayBuffersMiB: options.arrayBuffersMiB ?? 1,
  };
}

describe("runtime memory telemetry", () => {
  it("normalizes process memory and V8 heap-limit bytes to numeric values", () => {
    expect(
      readMemorySnapshot(
        {
          rss: 10 * ONE_MIB,
          heapUsed: 2.5 * ONE_MIB,
          heapTotal: 4 * ONE_MIB,
          external: 1.25 * ONE_MIB,
          arrayBuffers: 0.5 * ONE_MIB,
        },
        10 * ONE_MIB,
      ),
    ).toEqual({
      rssMiB: 10,
      heapUsedMiB: 2.5,
      heapTotalMiB: 4,
      heapLimitMiB: 10,
      heapUsedPercentOfLimit: 25,
      externalMiB: 1.25,
      arrayBuffersMiB: 0.5,
    });
  });

  it("emits one structured boot snapshot without secret-bearing fields", () => {
    const records: MemoryTelemetryRecord[] = [];
    logMemorySnapshot("server.boot", {
      read: () => snapshot(100, 40),
      log: (record) => records.push(record),
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      event: "axtask.runtime.memory",
      label: "server.boot",
      phase: "snapshot",
      outcome: "observed",
      after: snapshot(100, 40),
      pressureSignals: [],
    });
    expect(JSON.stringify(records[0])).not.toMatch(
      /DATABASE_URL|SESSION_SECRET|authorization/i,
    );
  });

  it("records duration, workload metrics, memory delta, and heap pressure", async () => {
    const records: MemoryTelemetryRecord[] = [];
    const reads = [snapshot(100, 70), snapshot(118, 85)];
    const times = [1000, 1025];

    const result = await withMemoryTelemetry(
      "reminders.dispatch",
      async () => ({ scanned: 12, sent: 8, failedSend: 1 }),
      {
        read: () => reads.shift()!,
        now: () => times.shift()!,
        log: (record) => records.push(record),
        metrics: (summary) => summary,
      },
    );

    expect(result.sent).toBe(8);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      label: "reminders.dispatch",
      outcome: "ok",
      durationMs: 25,
      delta: {
        rssMiB: 18,
        heapUsedMiB: 15,
      },
      pressureSignals: ["heap-near-limit", "heap-growth"],
      metrics: {
        scanned: 12,
        sent: 8,
        failedSend: 1,
      },
    });
  });

  it("distinguishes array-buffer growth from generic external growth", () => {
    const before = snapshot(100, 40, { externalMiB: 3, arrayBuffersMiB: 1 });
    const after = snapshot(112, 41, { externalMiB: 13, arrayBuffersMiB: 10 });
    const delta: MemorySnapshot = {
      rssMiB: after.rssMiB - before.rssMiB,
      heapUsedMiB: after.heapUsedMiB - before.heapUsedMiB,
      heapTotalMiB: 0,
      heapLimitMiB: 0,
      heapUsedPercentOfLimit:
        after.heapUsedPercentOfLimit - before.heapUsedPercentOfLimit,
      externalMiB: after.externalMiB - before.externalMiB,
      arrayBuffersMiB: after.arrayBuffersMiB - before.arrayBuffersMiB,
    };

    expect(detectMemoryPressure(after, delta)).toEqual(["array-buffer-growth"]);
  });

  it("flags RSS growth that is not explained by heap or external deltas", () => {
    const after = snapshot(121, 42, { externalMiB: 4, arrayBuffersMiB: 2 });
    const delta: MemorySnapshot = {
      rssMiB: 21,
      heapUsedMiB: 2,
      heapTotalMiB: 0,
      heapLimitMiB: 0,
      heapUsedPercentOfLimit: 2,
      externalMiB: 1,
      arrayBuffersMiB: 1,
    };

    expect(detectMemoryPressure(after, delta)).toEqual([
      "rss-unattributed-growth",
    ]);
  });

  it("bounds workload fields and rejects sensitive metric keys", async () => {
    const records: MemoryTelemetryRecord[] = [];
    await withMemoryTelemetry("bounded.metrics", async () => "done", {
      read: () => snapshot(100, 40),
      log: (record) => records.push(record),
      metrics: () => ({
        scanned: 3,
        token: "must-not-appear",
        note: "x".repeat(120),
      }),
    });

    expect(records[0]?.metrics).toEqual({
      scanned: 3,
      note: "x".repeat(80),
    });
  });

  it("suppresses successful no-op operations when requested", async () => {
    const log = vi.fn();
    await expect(
      withMemoryTelemetry("reminders.dispatch", async () => ({ scanned: 0 }), {
        read: () => snapshot(100, 40),
        now: () => 10,
        log,
        shouldLog: (result) => result.scanned > 0,
        metrics: (result) => ({ scanned: result.scanned }),
      }),
    ).resolves.toEqual({ scanned: 0 });
    expect(log).not.toHaveBeenCalled();
  });

  it("logs failures and rethrows the original error", async () => {
    const records: MemoryTelemetryRecord[] = [];
    const failure = new TypeError("synthetic failure");

    await expect(
      withMemoryTelemetry(
        "db-size-snapshot.capture",
        async () => {
          throw failure;
        },
        {
          read: () => snapshot(100, 40),
          now: () => 10,
          log: (record) => records.push(record),
          shouldLog: () => false,
        },
      ),
    ).rejects.toBe(failure);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      label: "db-size-snapshot.capture",
      outcome: "error",
      errorName: "TypeError",
      pressureSignals: [],
    });
  });

  it("never lets diagnostic failures alter the wrapped result", async () => {
    await expect(
      withMemoryTelemetry("safe.operation", async () => 42, {
        read: () => {
          throw new Error("snapshot unavailable");
        },
        log: () => {
          throw new Error("log unavailable");
        },
        metrics: () => {
          throw new Error("metrics unavailable");
        },
      }),
    ).resolves.toBe(42);
  });
});
