// @vitest-environment node
import { describe, expect, it, beforeEach } from "vitest";
import {
  emitOpsSnapshot,
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

  it("emits warnings when thresholds are exceeded", () => {
    for (let i = 0; i < 4; i += 1) {
      recordHttpRequest({ method: "GET", path: "/health", status: 200, durationMs: 1 });
    }
    const snap = emitOpsSnapshot();
    expect(snap.warnings.some((w) => w.includes("health checks"))).toBe(true);
  });

  it("tracks background job ticks", () => {
    recordBackgroundJob("reminders");
    recordBackgroundJob("reminders");
    const status = getOpsStatus();
    expect(status.counters.backgroundJobs.reminders).toBe(2);
  });
});
