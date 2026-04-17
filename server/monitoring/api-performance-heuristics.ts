import { normalizeApiRouteForPerf } from "./api-route-normalize";

export type ApiPerfRouteRow = {
  module: string;
  method: string;
  route: string;
  normalizedRoute: string;
  count: number;
  serverErrorCount: number;
  errorRate: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
};

export type ApiPerfSignal = {
  severity: "info" | "warning" | "critical";
  code: string;
  title: string;
  detail: string;
};

export function moduleLabelForNormalizedRoute(normalizedRoute: string): string {
  const p = normalizedRoute;
  if (p.startsWith("/api/admin")) return "Admin";
  if (p.startsWith("/api/tasks")) return "Tasks";
  if (p.startsWith("/api/gamification")) return "Gamification";
  if (p.startsWith("/api/auth") || p.startsWith("/api/mfa")) return "Auth";
  if (p.startsWith("/api/planner")) return "Planner";
  if (p.startsWith("/api/classification")) return "Classification";
  if (p.startsWith("/api/analytics")) return "Analytics";
  if (p.startsWith("/api/billing") || p.startsWith("/api/billing-bridge")) return "Billing";
  if (p.startsWith("/api/community")) return "Community";
  if (p.startsWith("/api/study")) return "Study";
  if (p.startsWith("/api/voice")) return "Voice";
  if (p.startsWith("/api/storage")) return "Storage";
  if (p.startsWith("/api/feedback")) return "Feedback";
  return "Other";
}

export function percentileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx]!;
}

export function computePercentilesMs(durationsMs: number[]): { p50Ms: number; p95Ms: number; p99Ms: number } {
  if (durationsMs.length === 0) {
    return { p50Ms: 0, p95Ms: 0, p99Ms: 0 };
  }
  const sorted = [...durationsMs].sort((a, b) => a - b);
  return {
    p50Ms: percentileSorted(sorted, 0.5),
    p95Ms: percentileSorted(sorted, 0.95),
    p99Ms: percentileSorted(sorted, 0.99),
  };
}

export type RawApiRequestEvent = {
  route: string | null | undefined;
  method: string | null | undefined;
  statusCode: number | null | undefined;
  durationMs: number | null | undefined;
};

/** Group raw events by method + normalized route; ignores rows without a usable duration. */
export function aggregateApiRequestEvents(events: RawApiRequestEvent[]): ApiPerfRouteRow[] {
  type Acc = { durations: number[]; serverErrors: number };
  const map = new Map<string, Acc>();

  for (const ev of events) {
    const rawRoute = ev.route ?? "";
    const method = (ev.method ?? "GET").toUpperCase();
    const dur = ev.durationMs;
    if (typeof dur !== "number" || !Number.isFinite(dur) || dur < 0) continue;

    const normalized = normalizeApiRouteForPerf(rawRoute);
    const key = `${method} ${normalized}`;
    let acc = map.get(key);
    if (!acc) {
      acc = { durations: [], serverErrors: 0 };
      map.set(key, acc);
    }
    acc.durations.push(dur);
    const sc = ev.statusCode ?? 0;
    if (sc >= 500) acc.serverErrors += 1;
  }

  const rows: ApiPerfRouteRow[] = [];
  for (const [key, acc] of map) {
    const [method, ...rest] = key.split(" ");
    const normalizedRoute = rest.join(" ");
    const count = acc.durations.length;
    const { p50Ms, p95Ms, p99Ms } = computePercentilesMs(acc.durations);
    const avgMs = acc.durations.reduce((a, b) => a + b, 0) / count;
    const serverErrorCount = acc.serverErrors;
    const errorRate = count > 0 ? serverErrorCount / count : 0;
    rows.push({
      module: moduleLabelForNormalizedRoute(normalizedRoute),
      method,
      route: key,
      normalizedRoute,
      count,
      serverErrorCount,
      errorRate,
      avgMs: Math.round(avgMs * 10) / 10,
      p50Ms: Math.round(p50Ms),
      p95Ms: Math.round(p95Ms),
      p99Ms: Math.round(p99Ms),
    });
  }

  rows.sort((a, b) => b.p95Ms - a.p95Ms || b.count - a.count);
  return rows;
}

const THRESH = {
  getTasksP95Ms: 800,
  anyP95Ms: 3000,
  minSamplesLatency: 12,
  minSamplesSlow: 5,
  errorRate: 0.04,
  minSamplesErrors: 25,
};

export function buildPerformanceSignals(rows: ApiPerfRouteRow[]): ApiPerfSignal[] {
  const signals: ApiPerfSignal[] = [];

  for (const r of rows) {
    if (
      r.method === "GET" &&
      r.normalizedRoute === "/api/tasks" &&
      r.p95Ms >= THRESH.getTasksP95Ms &&
      r.count >= THRESH.minSamplesLatency
    ) {
      signals.push({
        severity: r.p95Ms >= THRESH.anyP95Ms ? "critical" : "warning",
        code: "tasks_list_latency",
        title: "Task list endpoint is slow",
        detail: `GET /api/tasks p95 ≈ ${r.p95Ms}ms over ${r.count} samples (aggregated window). Large payloads or DB work may scale poorly.`,
      });
    }
    if (r.p95Ms >= THRESH.anyP95Ms && r.count >= THRESH.minSamplesSlow) {
      signals.push({
        severity: "warning",
        code: "slow_route",
        title: `Slow route: ${r.method} ${r.normalizedRoute}`,
        detail: `p95 ≈ ${r.p95Ms}ms, n=${r.count}, module ${r.module}.`,
      });
    }
    if (r.errorRate >= THRESH.errorRate && r.count >= THRESH.minSamplesErrors) {
      signals.push({
        severity: "critical",
        code: "elevated_server_errors",
        title: `Server errors on ${r.method} ${r.normalizedRoute}`,
        detail: `${(r.errorRate * 100).toFixed(1)}% HTTP 5xx (${r.serverErrorCount}/${r.count}) in window.`,
      });
    }
  }

  const seen = new Set<string>();
  return signals.filter((s) => {
    const k = `${s.code}:${s.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
