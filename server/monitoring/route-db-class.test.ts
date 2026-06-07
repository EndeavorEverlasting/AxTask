// @vitest-environment node
import { describe, expect, it } from "vitest";
import { classifyRouteDbTouch, parseRouteKey } from "./route-db-class";

describe("route-db-class", () => {
  it("classifies health as db_free", () => {
    expect(classifyRouteDbTouch("/health")).toBe("db_free");
    expect(classifyRouteDbTouch("/ready")).toBe("db_light");
  });

  it("classifies heavy admin routes", () => {
    expect(classifyRouteDbTouch("/api/admin/analytics/overview")).toBe("db_heavy");
  });

  it("parses route keys", () => {
    expect(parseRouteKey("GET /health")).toEqual({ method: "GET", path: "/health" });
  });
});
