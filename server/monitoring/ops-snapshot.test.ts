// @vitest-environment node
import { describe, expect, it, beforeEach } from "vitest";
import {
  emitOpsSnapshot,
  getAttributionForUsage,
  getOpsStatus,
  recordBackgroundJob,
  recordHttpRequest,
  resetOpsSnapshotForTests,
} from "./ops-snapshot";

describe("ops-snapshot", () => {
  beforeEach(() => {
    resetOpsSnapshotForTests();
  });

  it("aggregates request counts and top routes", () => {
    recordHttpRequest({ method: "GET", path: "/health", status: 200, durationMs: 1 });
    recordHttpRequest({ method: "GET", path: "/api/tasks", status: 200, durationMs: 12 });
    recordHttpRequest({ method: "GET", path: "/api/tasks", status: 500, durationMs: 40 });

    const status = getOpsStatus();
    expect(status.counters.requestsTotal).toBe(3);
    expect(status.counters.healthChecks).toBe(1);
    expect(status.counters.errors5xx).toBe(1);
    expect(status.topRoutes[0]).toEqual(["GET /api/tasks", 2]);
  });

  it("normalizes dynamic path segments in route keys", () => {
    recordHttpRequest({ method: "GET", path: "/api/tasks/123/report", status: 200, durationMs: 1 });
    recordHttpRequest({ method: "GET", path: "/api/tasks/456/report", status: 200, durationMs: 1 });

    const status = getOpsStatus();
    expect(status.topRoutes).toEqual([["GET /api/tasks/:num/report", 2]]);
  });

  it("computes db-touch percentage from all routes, not only top 10", () => {
    for (let i = 0; i < 11; i += 1) {
      recordHttpRequest({ method: "GET", path: `/api/heavy-${i}`, status: 200, durationMs: 1 });
    }
    recordHttpRequest({ method: "GET", path: "/health", status: 200, durationMs: 1 });

    const attribution = getAttributionForUsage();
    expect(attribution.requestsTotal).toBe(12);
    expect(attribution.dbTouchingRequestPct).toBeGreaterThan(80);
  });

  it("emits warnings when thresholds are exceeded", () => {
    for (let i = 0; i < 4; i += 1) {
      recordHttpRequest({ method: "GET", path: "/health", status: 200, durationMs: 1 });
    }
    const snap = emitOpsSnapshot();
    expect(snap.window).toBe("since_boot");
    expect(snap.warnings.some((w) => w.includes("health checks"))).toBe(true);
  });

  it("does not alias snapshot warnings when attribution is read", () => {
    emitOpsSnapshot();
    const first = getAttributionForUsage();
    const second = getAttributionForUsage();
    expect(first.opsWarnings).not.toBe(second.opsWarnings);
  });

  it("tracks background job ticks", () => {
    recordBackgroundJob("reminders");
    recordBackgroundJob("reminders");
    const status = getOpsStatus();
    expect(status.counters.backgroundJobs.reminders).toBe(2);
  });
});
