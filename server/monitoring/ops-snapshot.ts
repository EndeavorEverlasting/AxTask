/**
 * In-memory operational counters and periodic snapshot logs for cheap telemetry.
 * No DB writes on the hot path — snapshots emit structured JSON to stdout.
 */

import type { Request, Response, NextFunction } from "express";

type RouteCount = Map<string, number>;

export type OpsSnapshotPayload = {
  event: "axtask.ops.snapshot";
  window: "24h";
  requestsTotal: number;
  healthChecks: number;
  readyChecks: number;
  errors4xx: number;
  errors5xx: number;
  boots: number;
  uptimeSeconds: number;
  memoryRssMb: number;
  topRoutes: Array<[string, number]>;
  backgroundJobs: Record<string, number>;
  warnings: string[];
  ts: string;
};

export type OpsStatusPayload = {
  ok: true;
  service: "axtask";
  uptimeSeconds: number;
  memoryRssMb: number;
  counters: {
    boots: number;
    requestsTotal: number;
    healthChecks: number;
    readyChecks: number;
    errors4xx: number;
    errors5xx: number;
    backgroundJobs: Record<string, number>;
  };
  topRoutes: Array<[string, number]>;
  lastSnapshot: OpsSnapshotPayload | null;
  ts: string;
};

const routeCounts: RouteCount = new Map();
const backgroundJobs: Record<string, number> = {};

let boots = 0;
let requestsTotal = 0;
let healthChecks = 0;
let readyChecks = 0;
let errors4xx = 0;
let errors5xx = 0;
let lastSnapshot: OpsSnapshotPayload | null = null;
const bootedAt = Date.now();

function normalizeRouteKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

function memoryRssMb(): number {
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

function topRoutes(limit = 10): Array<[string, number]> {
  return [...routeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function evaluateWarnings(snapshot: Omit<OpsSnapshotPayload, "warnings" | "event" | "window" | "ts">): string[] {
  const warnings: string[] = [];
  if (snapshot.boots > 3) warnings.push(`boot count ${snapshot.boots} exceeds 3 per window`);
  if (snapshot.errors5xx > 5) warnings.push(`5xx count ${snapshot.errors5xx} exceeds 5 per window`);
  if (snapshot.requestsTotal > 0 && snapshot.healthChecks / snapshot.requestsTotal > 0.8) {
    warnings.push("health checks exceed 80% of request traffic");
  }
  return warnings;
}

export function recordBoot(): void {
  boots += 1;
}

export function recordBackgroundJob(name: string): void {
  backgroundJobs[name] = (backgroundJobs[name] ?? 0) + 1;
}

export function recordHttpRequest(input: {
  method: string;
  path: string;
  status: number;
  durationMs: number;
}): void {
  requestsTotal += 1;
  if (input.path === "/health") healthChecks += 1;
  if (input.path === "/ready") readyChecks += 1;
  if (input.status >= 500) errors5xx += 1;
  else if (input.status >= 400) errors4xx += 1;

  const key = normalizeRouteKey(input.method, input.path);
  routeCounts.set(key, (routeCounts.get(key) ?? 0) + 1);
}

export function emitBootEvent(): void {
  if (process.env.NODE_ENV === "test") return;
  console.log(
    JSON.stringify({
      event: "axtask.boot",
      ts: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV ?? null,
      renderServiceId: process.env.RENDER_SERVICE_ID ?? null,
      renderInstanceId: process.env.RENDER_INSTANCE_ID ?? null,
      renderGitCommit: process.env.RENDER_GIT_COMMIT ?? null,
      uptimeSeconds: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
    }),
  );
  recordBoot();
}

export function emitOpsSnapshot(): OpsSnapshotPayload {
  const base = {
    requestsTotal,
    healthChecks,
    readyChecks,
    errors4xx,
    errors5xx,
    boots,
    uptimeSeconds: Math.floor(process.uptime()),
    memoryRssMb: memoryRssMb(),
    topRoutes: topRoutes(),
    backgroundJobs: { ...backgroundJobs },
  };
  const warnings = evaluateWarnings(base);
  const payload: OpsSnapshotPayload = {
    event: "axtask.ops.snapshot",
    window: "24h",
    ...base,
    warnings,
    ts: new Date().toISOString(),
  };
  lastSnapshot = payload;
  if (process.env.NODE_ENV !== "test") {
    console.log(JSON.stringify(payload));
  }
  return payload;
}

export function getOpsStatus(): OpsStatusPayload {
  return {
    ok: true,
    service: "axtask",
    uptimeSeconds: Math.floor((Date.now() - bootedAt) / 1000),
    memoryRssMb: memoryRssMb(),
    counters: {
      boots,
      requestsTotal,
      healthChecks,
      readyChecks,
      errors4xx,
      errors5xx,
      backgroundJobs: { ...backgroundJobs },
    },
    topRoutes: topRoutes(),
    lastSnapshot,
    ts: new Date().toISOString(),
  };
}

/** Structured JSON access log for all routes (no response bodies). */
export function attachStructuredRequestLog(): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      const path = req.path;
      const isHealth = path === "/health" || path === "/ready";
      const durationMs = Date.now() - startedAt;
      recordHttpRequest({
        method: req.method,
        path,
        status: res.statusCode,
        durationMs,
      });
      if (process.env.NODE_ENV === "test") return;
      console.log(
        JSON.stringify({
          event: "http.request",
          ts: new Date().toISOString(),
          method: req.method,
          path,
          status: res.statusCode,
          durationMs,
          isHealth,
          userAgent: req.get("user-agent") ?? null,
        }),
      );
    });
    next();
  };
}

export function startOpsSnapshotTicker(options?: { intervalMs?: number; initialDelayMs?: number }): void {
  if (process.env.NODE_ENV === "test" || process.env.DISABLE_OPS_SNAPSHOT === "true") return;
  const intervalMs = options?.intervalMs ?? (Number(process.env.OPS_SNAPSHOT_INTERVAL_MS) || 24 * 60 * 60 * 1000);
  const initialDelayMs = options?.initialDelayMs ?? (Number(process.env.OPS_SNAPSHOT_INITIAL_DELAY_MS) || 5 * 60 * 1000);
  setTimeout(() => {
    emitOpsSnapshot();
    setInterval(() => emitOpsSnapshot(), intervalMs);
  }, initialDelayMs);
}

/** Test-only reset */
export function resetOpsSnapshotForTests(): void {
  boots = 0;
  requestsTotal = 0;
  healthChecks = 0;
  readyChecks = 0;
  errors4xx = 0;
  errors5xx = 0;
  lastSnapshot = null;
  routeCounts.clear();
  for (const key of Object.keys(backgroundJobs)) delete backgroundJobs[key];
}
