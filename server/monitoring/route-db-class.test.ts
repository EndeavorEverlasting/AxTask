// @vitest-environment node
import { describe, expect, it } from "vitest";
import { classifyRouteDbTouch, parseRouteKey } from "./route-db-class";

describe("route-db-class", () => {
  it("classifies health and ops probes", () => {
    expect(classifyRouteDbTouch("/health")).toBe("db_free");
    expect(classifyRouteDbTouch("/ops/status")).toBe("db_free");
    expect(classifyRouteDbTouch("/ready")).toBe("db_light");
  });

  it("classifies heavy admin routes", () => {
    expect(classifyRouteDbTouch("/api/admin/analytics/overview")).toBe("db_heavy");
    expect(classifyRouteDbTouch("/api/admin/usage/provider-import")).toBe("db_heavy");
    expect(classifyRouteDbTouch("/api/admin/usage/capture")).toBe("db_heavy");
  });

  it("classifies usage overview as db_light", () => {
    expect(classifyRouteDbTouch("/api/admin/usage")).toBe("db_light");
  });

  it("parses route keys", () => {
    expect(parseRouteKey("GET /health")).toEqual({ method: "GET", path: "/health" });
  });
});
