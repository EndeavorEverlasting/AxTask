// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normalizeApiRouteForPerf } from "./api-route-normalize";

describe("normalizeApiRouteForPerf", () => {
  it("normalizes UUID path segments to :id", () => {
    expect(
      normalizeApiRouteForPerf("/api/tasks/550e8400-e29b-41d4-a716-446655440000"),
    ).toBe("/api/tasks/:id");
  });

  it("normalizes numeric segments to :num", () => {
    expect(normalizeApiRouteForPerf("/api/foo/123/bar")).toBe("/api/foo/:num/bar");
  });

  it("handles empty and root", () => {
    expect(normalizeApiRouteForPerf("")).toBe("/");
    expect(normalizeApiRouteForPerf(null)).toBe("/");
  });

  it("preserves static API paths", () => {
    expect(normalizeApiRouteForPerf("/api/tasks")).toBe("/api/tasks");
  });
});
