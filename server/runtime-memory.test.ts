import { describe, expect, it, vi } from "vitest";
import {
  logMemorySnapshot,
  readMemorySnapshot,
  withMemoryTelemetry,
  type MemorySnapshot,
  type MemoryTelemetryRecord,
} from "./runtime-memory";

const ONE_MIB = 1024 * 1024;

function snapshot(rssMiB: number, heapUsedMiB: number): MemorySnapshot {
  return {
    rssMiB,
    heapUsedMiB,
    heapTotalMiB: 20,
    externalMiB: 3,
    arrayBuffersMiB: 1,
  };
}

describe("runtime memory telemetry", () => {
  it("normalizes process memory bytes to numeric MiB values", () => {
    expect(
      readMemorySnapshot({
        rss: 10 * ONE_MIB,
        heapUsed: 2.5 * ONE_MIB,
        heapTotal: 4 * ONE_MIB,
        external: 1.25 * ONE_MIB,
        arrayBuffers: 0.5 * ONE_MIB,
      }),
    ).toEqual({
      rssMiB: 10,
      heapUsedMiB: 2.5,
      heapTotalMiB: 4,
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
    });
    expect(JSON.stringify(records[0])).not.toMatch(/DATABASE_URL|SESSION_SECRET|authorization/i);
  });

  it("records one success line with duration and memory delta", async () => {
    const records: MemoryTelemetryRecord[] = [];
    const reads = [snapshot(100, 40), snapshot(106, 43)];
    const times = [1000, 1025];

    const result = await withMemoryTelemetry(
      "retention-prune.run",
      async () => "done",
      {
        read: () => reads.shift()!,
        now: () => times.shift()!,
        log: (record) => records.push(record),
      },
    );

    expect(result).toBe("done");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      label: "retention-prune.run",
      outcome: "ok",
      durationMs: 25,
      delta: {
        rssMiB: 6,
        heapUsedMiB: 3,
      },
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
      }),
    ).resolves.toEqual({ scanned: 0 });
    expect(log).not.toHaveBeenCalled();
  });

  it("logs failures and rethrows the original error", async () => {
    const records: MemoryTelemetryRecord[] = [];
    const failure = new TypeError("synthetic failure");

    await expect(
      withMemoryTelemetry("db-size-snapshot.capture", async () => {
        throw failure;
      }, {
        read: () => snapshot(100, 40),
        now: () => 10,
        log: (record) => records.push(record),
        shouldLog: () => false,
      }),
    ).rejects.toBe(failure);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      label: "db-size-snapshot.capture",
      outcome: "error",
      errorName: "TypeError",
    });
  });

  it("never lets snapshot or logging failures alter the wrapped result", async () => {
    await expect(
      withMemoryTelemetry("safe.operation", async () => 42, {
        read: () => {
          throw new Error("snapshot unavailable");
        },
        log: () => {
          throw new Error("log unavailable");
        },
      }),
    ).resolves.toBe(42);
  });
});
