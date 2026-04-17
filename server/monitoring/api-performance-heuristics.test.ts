// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  aggregateApiRequestEvents,
  buildPerformanceSignals,
  computePercentilesMs,
  moduleLabelForNormalizedRoute,
} from "./api-performance-heuristics";

describe("moduleLabelForNormalizedRoute", () => {
  it("maps known prefixes", () => {
    expect(moduleLabelForNormalizedRoute("/api/tasks")).toBe("Tasks");
    expect(moduleLabelForNormalizedRoute("/api/gamification/wallet")).toBe("Gamification");
    expect(moduleLabelForNormalizedRoute("/api/admin/users")).toBe("Admin");
  });
});

describe("computePercentilesMs", () => {
  it("returns percentiles for sorted-like input", () => {
    const d = Array.from({ length: 100 }, (_, i) => i);
    const p = computePercentilesMs(d);
    expect(p.p50Ms).toBeGreaterThanOrEqual(49);
    expect(p.p95Ms).toBeGreaterThanOrEqual(90);
  });
});

describe("aggregateApiRequestEvents", () => {
  it("groups by normalized route and computes stats", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const rows = aggregateApiRequestEvents([
      { route: `/api/tasks/${id}`, method: "GET", statusCode: 200, durationMs: 10 },
      { route: `/api/tasks/${id}`, method: "GET", statusCode: 200, durationMs: 20 },
      { route: "/api/other", method: "GET", statusCode: 500, durationMs: 5 },
    ]);
    expect(rows.length).toBe(2);
    const tasks = rows.find((r) => r.normalizedRoute === "/api/tasks/:id");
    expect(tasks?.count).toBe(2);
    expect(tasks?.p95Ms).toBeGreaterThanOrEqual(10);
  });

  it("skips rows without duration", () => {
    const rows = aggregateApiRequestEvents([
      { route: "/api/x", method: "GET", statusCode: 200, durationMs: null as unknown as number },
    ]);
    expect(rows.length).toBe(0);
  });
});

describe("buildPerformanceSignals", () => {
  it("emits task list latency warning when GET /api/tasks is slow with enough samples", () => {
    const sig = buildPerformanceSignals([
      {
        module: "Tasks",
        method: "GET",
        route: "GET /api/tasks",
        normalizedRoute: "/api/tasks",
        count: 15,
        serverErrorCount: 0,
        errorRate: 0,
        avgMs: 900,
        p50Ms: 850,
        p95Ms: 900,
        p99Ms: 950,
      },
    ]);
    expect(sig.some((s) => s.code === "tasks_list_latency")).toBe(true);
  });

  it("emits elevated server errors when rate is high", () => {
    const row = {
      module: "X",
      method: "GET",
      route: "GET /api/x",
      normalizedRoute: "/api/x",
      count: 30,
      serverErrorCount: 5,
      errorRate: 5 / 30,
      avgMs: 10,
      p50Ms: 10,
      p95Ms: 12,
      p99Ms: 15,
    };
    const sig = buildPerformanceSignals([row]);
    expect(sig.some((s) => s.code === "elevated_server_errors")).toBe(true);
  });
});
