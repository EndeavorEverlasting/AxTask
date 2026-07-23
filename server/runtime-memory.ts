import { getHeapStatistics } from "node:v8";

export type MemorySnapshot = {
  rssMiB: number;
  heapUsedMiB: number;
  heapTotalMiB: number;
  heapLimitMiB: number;
  heapUsedPercentOfLimit: number;
  externalMiB: number;
  arrayBuffersMiB: number;
};

export type MemoryPressureSignal =
  | "heap-near-limit"
  | "heap-growth"
  | "external-growth"
  | "array-buffer-growth"
  | "rss-unattributed-growth";

export type MemoryTelemetryMetricValue = string | number | boolean | null;
export type MemoryTelemetryMetrics = Record<string, MemoryTelemetryMetricValue>;

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
  pressureSignals: MemoryPressureSignal[];
  metrics?: MemoryTelemetryMetrics;
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
  metrics?: (result: T) => MemoryTelemetryMetrics;
};

const MIB = 1024 * 1024;
const HEAP_NEAR_LIMIT_PERCENT = 80;
const GROWTH_SIGNAL_MIB = 8;
const RSS_UNATTRIBUTED_GROWTH_MIB = 16;
const MAX_METRIC_KEYS = 12;
const MAX_METRIC_STRING_LENGTH = 80;
const SAFE_METRIC_KEY = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const SENSITIVE_METRIC_KEY = /(secret|token|password|authorization|cookie|credential|payload|body|header|email|user)/i;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function toMiB(bytes: number): number {
  return round(bytes / MIB);
}

function subtractSnapshots(
  after: MemorySnapshot | null,
  before: MemorySnapshot | null,
): MemorySnapshot | null {
  if (!after || !before) return null;
  return {
    rssMiB: round(after.rssMiB - before.rssMiB),
    heapUsedMiB: round(after.heapUsedMiB - before.heapUsedMiB),
    heapTotalMiB: round(after.heapTotalMiB - before.heapTotalMiB),
    heapLimitMiB: round(after.heapLimitMiB - before.heapLimitMiB),
    heapUsedPercentOfLimit: round(
      after.heapUsedPercentOfLimit - before.heapUsedPercentOfLimit,
    ),
    externalMiB: round(after.externalMiB - before.externalMiB),
    arrayBuffersMiB: round(after.arrayBuffersMiB - before.arrayBuffersMiB),
  };
}

export function detectMemoryPressure(
  after: MemorySnapshot | null,
  delta: MemorySnapshot | null,
): MemoryPressureSignal[] {
  const signals: MemoryPressureSignal[] = [];

  if (after && after.heapUsedPercentOfLimit >= HEAP_NEAR_LIMIT_PERCENT) {
    signals.push("heap-near-limit");
  }

  if (!delta) return signals;

  if (delta.heapUsedMiB >= GROWTH_SIGNAL_MIB) {
    signals.push("heap-growth");
  }

  if (delta.arrayBuffersMiB >= GROWTH_SIGNAL_MIB) {
    signals.push("array-buffer-growth");
  } else if (delta.externalMiB >= GROWTH_SIGNAL_MIB) {
    signals.push("external-growth");
  }

  if (
    delta.rssMiB >= RSS_UNATTRIBUTED_GROWTH_MIB &&
    delta.heapUsedMiB < GROWTH_SIGNAL_MIB &&
    delta.externalMiB < GROWTH_SIGNAL_MIB &&
    delta.arrayBuffersMiB < GROWTH_SIGNAL_MIB
  ) {
    signals.push("rss-unattributed-growth");
  }

  return signals;
}

export function readMemorySnapshot(
  usage: MemoryUsageInput = process.memoryUsage(),
  heapLimitBytes: number = getHeapStatistics().heap_size_limit,
): MemorySnapshot {
  const heapUsedMiB = toMiB(usage.heapUsed);
  const heapLimitMiB = toMiB(heapLimitBytes);
  return {
    rssMiB: toMiB(usage.rss),
    heapUsedMiB,
    heapTotalMiB: toMiB(usage.heapTotal),
    heapLimitMiB,
    heapUsedPercentOfLimit:
      heapLimitMiB > 0 ? round((heapUsedMiB / heapLimitMiB) * 100) : 0,
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

function safeMetrics<T>(
  describe: ((result: T) => MemoryTelemetryMetrics) | undefined,
  result: T,
): MemoryTelemetryMetrics | undefined {
  if (!describe) return undefined;
  try {
    const raw = describe(result);
    if (!raw || typeof raw !== "object") return undefined;

    const output: MemoryTelemetryMetrics = {};
    for (const [key, value] of Object.entries(raw).slice(0, MAX_METRIC_KEYS)) {
      if (!SAFE_METRIC_KEY.test(key) || SENSITIVE_METRIC_KEY.test(key)) continue;
      if (value === null || typeof value === "boolean") {
        output[key] = value;
      } else if (typeof value === "number" && Number.isFinite(value)) {
        output[key] = value;
      } else if (typeof value === "string") {
        output[key] = value.slice(0, MAX_METRIC_STRING_LENGTH);
      }
    }
    return Object.keys(output).length > 0 ? output : undefined;
  } catch {
    return undefined;
  }
}

export function logMemorySnapshot(
  label: string,
  options: Pick<TelemetryOptions<never>, "read" | "log"> = {},
): void {
  const read = options.read ?? (() => readMemorySnapshot());
  const log = options.log ?? defaultLog;
  const after = safeRead(read);
  safeLog(log, {
    event: "axtask.runtime.memory",
    label,
    phase: "snapshot",
    outcome: "observed",
    pid: process.pid,
    uptimeSeconds: Math.round(process.uptime()),
    after,
    pressureSignals: detectMemoryPressure(after, null),
  });
}

/**
 * Runs one operation and emits at most one structured line.
 *
 * Callers may suppress successful no-op runs with `shouldLog`. Failures are
 * always logged and rethrown. Snapshot/log/metric failures are swallowed so
 * diagnostics cannot alter the wrapped operation's result.
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
    const delta = subtractSnapshots(after, before);
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
        delta,
        pressureSignals: detectMemoryPressure(after, delta),
        metrics: safeMetrics(options.metrics, result),
      });
    }
    return result;
  } catch (error) {
    const after = safeRead(read);
    const delta = subtractSnapshots(after, before);
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
      delta,
      pressureSignals: detectMemoryPressure(after, delta),
      errorName: error instanceof Error ? error.name : "Error",
    });
    throw error;
  }
}
