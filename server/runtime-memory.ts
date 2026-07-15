export type MemorySnapshot = {
  rssMiB: number;
  heapUsedMiB: number;
  heapTotalMiB: number;
  externalMiB: number;
  arrayBuffersMiB: number;
};

export type MemoryTelemetryRecord = {
  event: "axtask.runtime.memory";
  label: string;
  phase: "snapshot" | "operation";
  outcome: "observed" | "ok" | "error";
  durationMs?: number;
  pid: number;
  uptimeSeconds: number;
  before?: MemorySnapshot | null;
  after: MemorySnapshot | null;
  delta?: MemorySnapshot | null;
  errorName?: string;
};

type MemoryUsageInput = Pick<
  NodeJS.MemoryUsage,
  "rss" | "heapUsed" | "heapTotal" | "external" | "arrayBuffers"
>;

type TelemetryOptions<T> = {
  read?: () => MemorySnapshot;
  now?: () => number;
  log?: (record: MemoryTelemetryRecord) => void;
  shouldLog?: (result: T) => boolean;
};

const MIB = 1024 * 1024;

function toMiB(bytes: number): number {
  return Math.round((bytes / MIB) * 100) / 100;
}

function subtractSnapshots(
  after: MemorySnapshot | null,
  before: MemorySnapshot | null,
): MemorySnapshot | null {
  if (!after || !before) return null;
  return {
    rssMiB: Math.round((after.rssMiB - before.rssMiB) * 100) / 100,
    heapUsedMiB: Math.round((after.heapUsedMiB - before.heapUsedMiB) * 100) / 100,
    heapTotalMiB: Math.round((after.heapTotalMiB - before.heapTotalMiB) * 100) / 100,
    externalMiB: Math.round((after.externalMiB - before.externalMiB) * 100) / 100,
    arrayBuffersMiB: Math.round((after.arrayBuffersMiB - before.arrayBuffersMiB) * 100) / 100,
  };
}

export function readMemorySnapshot(
  usage: MemoryUsageInput = process.memoryUsage(),
): MemorySnapshot {
  return {
    rssMiB: toMiB(usage.rss),
    heapUsedMiB: toMiB(usage.heapUsed),
    heapTotalMiB: toMiB(usage.heapTotal),
    externalMiB: toMiB(usage.external),
    arrayBuffersMiB: toMiB(usage.arrayBuffers),
  };
}

function defaultLog(record: MemoryTelemetryRecord): void {
  console.info(JSON.stringify(record));
}

function safeRead(read: () => MemorySnapshot): MemorySnapshot | null {
  try {
    return read();
  } catch {
    return null;
  }
}

function safeLog(
  log: (record: MemoryTelemetryRecord) => void,
  record: MemoryTelemetryRecord,
): void {
  try {
    log(record);
  } catch {
    // Diagnostics must never change application behavior.
  }
}

export function logMemorySnapshot(
  label: string,
  options: Pick<TelemetryOptions<never>, "read" | "log"> = {},
): void {
  const read = options.read ?? (() => readMemorySnapshot());
  const log = options.log ?? defaultLog;
  safeLog(log, {
    event: "axtask.runtime.memory",
    label,
    phase: "snapshot",
    outcome: "observed",
    pid: process.pid,
    uptimeSeconds: Math.round(process.uptime()),
    after: safeRead(read),
  });
}

/**
 * Runs one operation and emits at most one structured line.
 *
 * Callers may suppress successful no-op runs with `shouldLog`. Failures are
 * always logged and rethrown. Snapshot/log failures are swallowed so telemetry
 * cannot alter the wrapped operation's result.
 */
export async function withMemoryTelemetry<T>(
  label: string,
  run: () => Promise<T>,
  options: TelemetryOptions<T> = {},
): Promise<T> {
  const read = options.read ?? (() => readMemorySnapshot());
  const now = options.now ?? (() => Date.now());
  const log = options.log ?? defaultLog;
  const before = safeRead(read);
  const startedAt = now();

  try {
    const result = await run();
    const after = safeRead(read);
    let shouldLog = true;
    if (options.shouldLog) {
      try {
        shouldLog = options.shouldLog(result);
      } catch {
        shouldLog = true;
      }
    }
    if (shouldLog) {
      safeLog(log, {
        event: "axtask.runtime.memory",
        label,
        phase: "operation",
        outcome: "ok",
        durationMs: Math.max(0, now() - startedAt),
        pid: process.pid,
        uptimeSeconds: Math.round(process.uptime()),
        before,
        after,
        delta: subtractSnapshots(after, before),
      });
    }
    return result;
  } catch (error) {
    const after = safeRead(read);
    safeLog(log, {
      event: "axtask.runtime.memory",
      label,
      phase: "operation",
      outcome: "error",
      durationMs: Math.max(0, now() - startedAt),
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      before,
      after,
      delta: subtractSnapshots(after, before),
      errorName: error instanceof Error ? error.name : "Error",
    });
    throw error;
  }
}
