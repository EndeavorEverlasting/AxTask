import type { Response } from "express";

type StreamEntry = {
  res: Response;
  heartbeat: ReturnType<typeof setInterval> | null;
};

const byUser = new Map<string, Set<StreamEntry>>();

export const CLASSIFICATION_SSE_MAX_PER_USER = 3;
const MAX_STREAMS_PER_USER = CLASSIFICATION_SSE_MAX_PER_USER;
const HEARTBEAT_MS = 25_000;

export function classificationSseCount(userId: string): number {
  return byUser.get(userId)?.size ?? 0;
}

function writeSseData(res: Response, data: unknown): boolean {
  try {
    const payload = JSON.stringify(data);
    res.write(`data: ${payload}\n\n`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Register an open SSE response for the user. Call after flushing SSE headers.
 * Returns false if the user already has the maximum concurrent streams.
 */
export function registerClassificationSse(userId: string, res: Response): boolean {
  let set = byUser.get(userId);
  if (!set) {
    set = new Set();
    byUser.set(userId, set);
  }
  if (set.size >= MAX_STREAMS_PER_USER) return false;

  const entry: StreamEntry = { res, heartbeat: null };
  set.add(entry);

  entry.heartbeat = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      removeClassificationSse(userId, entry);
    }
  }, HEARTBEAT_MS);

  const cleanup = () => removeClassificationSse(userId, entry);
  res.on("close", cleanup);
  res.on("finish", cleanup);

  return true;
}

export function removeClassificationSse(userId: string, entry: StreamEntry): void {
  if (entry.heartbeat) {
    clearInterval(entry.heartbeat);
    entry.heartbeat = null;
  }
  const set = byUser.get(userId);
  if (!set) return;
  set.delete(entry);
  if (set.size === 0) byUser.delete(userId);
}

/** True if this user has at least one active classification SSE connection. */
export function hasClassificationSse(userId: string): boolean {
  const set = byUser.get(userId);
  return Boolean(set && set.size > 0);
}

/**
 * Broadcast a JSON payload to all SSE connections for the user (classification events).
 */
export function broadcastClassificationEvent(userId: string, payload: unknown): void {
  const set = byUser.get(userId);
  if (!set) return;
  const entries = [...set];
  const failed: StreamEntry[] = [];
  for (const entry of entries) {
    if (!writeSseData(entry.res, payload)) {
      failed.push(entry);
    }
  }
  for (const entry of failed) {
    removeClassificationSse(userId, entry);
  }
}
