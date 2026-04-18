import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "../db";
import { securityEvents } from "@shared/schema";
import {
  aggregateApiRequestEvents,
  buildPerformanceSignals,
  type ApiPerfRouteRow,
  type ApiPerfSignal,
} from "../monitoring/api-performance-heuristics";

export type ApiPerformanceHeuristicsResult = {
  windowHours: number;
  sampledEvents: number;
  actorUserId: string | null;
  routes: ApiPerfRouteRow[];
  signals: ApiPerfSignal[];
  generatedAt: string;
};

function parseDurationMs(payloadJson: string | null): number | null {
  if (!payloadJson) return null;
  try {
    const p = JSON.parse(payloadJson) as { durationMs?: unknown };
    const d = p.durationMs;
    if (typeof d === "number" && Number.isFinite(d)) return d;
    return null;
  } catch {
    return null;
  }
}

/**
 * Loads recent `api_request` security events and rolls up latency by normalized route.
 * Caps rows read to keep admin queries predictable under load.
 */
export async function getApiPerformanceHeuristics(options: {
  windowHours: number;
  actorUserId?: string | null;
  maxEvents?: number;
}): Promise<ApiPerformanceHeuristicsResult> {
  const windowHours = Math.min(Math.max(options.windowHours || 24, 1), 168);
  const maxEvents = Math.min(Math.max(options.maxEvents ?? 25_000, 100), 100_000);
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const actorUserId = options.actorUserId?.trim() || null;

  const filters = [
    eq(securityEvents.eventType, "api_request"),
    gte(securityEvents.createdAt, since),
  ] as const;
  const whereClause = actorUserId ? and(...filters, eq(securityEvents.actorUserId, actorUserId)) : and(...filters);

  const rows = await db
    .select({
      route: securityEvents.route,
      method: securityEvents.method,
      statusCode: securityEvents.statusCode,
      payloadJson: securityEvents.payloadJson,
    })
    .from(securityEvents)
    .where(whereClause)
    .orderBy(desc(securityEvents.createdAt))
    .limit(maxEvents);

  const raw = rows.map((r) => ({
    route: r.route,
    method: r.method,
    statusCode: r.statusCode,
    durationMs: parseDurationMs(r.payloadJson),
  }));

  const routes = aggregateApiRequestEvents(raw);
  const signals = buildPerformanceSignals(routes);

  return {
    windowHours,
    sampledEvents: raw.filter((x) => typeof x.durationMs === "number").length,
    actorUserId,
    routes,
    signals,
    generatedAt: new Date().toISOString(),
  };
}
