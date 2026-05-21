export type MemorySnapshot = {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
};

function toMiB(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

export function readMemorySnapshot(): MemorySnapshot {
  const m = process.memoryUsage();
  return {
    rss: m.rss,
    heapUsed: m.heapUsed,
    heapTotal: m.heapTotal,
    external: m.external,
    arrayBuffers: m.arrayBuffers,
  };
}

export function formatMemorySnapshot(snapshot: MemorySnapshot): Record<string, string> {
  return {
    rssMiB: `${toMiB(snapshot.rss)} MiB`,
    heapUsedMiB: `${toMiB(snapshot.heapUsed)} MiB`,
    heapTotalMiB: `${toMiB(snapshot.heapTotal)} MiB`,
    externalMiB: `${toMiB(snapshot.external)} MiB`,
    arrayBuffersMiB: `${toMiB(snapshot.arrayBuffers)} MiB`,
  };
}

export async function withMemoryTelemetry<T>(label: string, run: () => Promise<T>): Promise<T> {
  console.info(`[memory] ${label}:before`, formatMemorySnapshot(readMemorySnapshot()));
  try {
    return await run();
  } finally {
    console.info(`[memory] ${label}:after`, formatMemorySnapshot(readMemorySnapshot()));
  }
}
