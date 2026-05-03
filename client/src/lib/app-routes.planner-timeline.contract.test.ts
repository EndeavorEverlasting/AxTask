import { describe, expect, it } from "vitest";
import { isValidAppPath } from "./app-routes";

describe("app-routes planner timeline", () => {
  it("accepts /planner/timeline for persistence and next=", () => {
    expect(isValidAppPath("/planner/timeline")).toBe(true);
  });
});
