// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sourceToAptitudeArchetype } from "./lib/organization-aptitude-map";

describe("organization rewards archetype heuristics", () => {
  it("maps sort and filter sources to deterministic archetype buckets", () => {
    expect(sourceToAptitudeArchetype("header_sort_date")).toBe("strategy");
    expect(sourceToAptitudeArchetype("header_sort_created")).toBe("strategy");
    expect(sourceToAptitudeArchetype("header_sort_priority")).toBe("productivity");
    expect(sourceToAptitudeArchetype("header_sort_activity")).toBe("social");
    expect(sourceToAptitudeArchetype("header_sort_classification")).toBe("archetype");
    expect(sourceToAptitudeArchetype("header_priority")).toBe("mood");
    expect(sourceToAptitudeArchetype("search")).toBe("archetype");
  });
});
