// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mapNodeWeaverCategoryToAxTaskLabel } from "./nodeweaver-category-map";

describe("mapNodeWeaverCategoryToAxTaskLabel", () => {
  it("maps grocery and shopping NW labels to Shopping", () => {
    expect(mapNodeWeaverCategoryToAxTaskLabel("Grocery")).toBe("Shopping");
    expect(mapNodeWeaverCategoryToAxTaskLabel("grocery_trips")).toBe("Shopping");
    expect(mapNodeWeaverCategoryToAxTaskLabel("errand_run")).toBe("Shopping");
    expect(mapNodeWeaverCategoryToAxTaskLabel("Retail")).toBe("Shopping");
  });

  it("canonicalizes known AxTask labels case-insensitively", () => {
    expect(mapNodeWeaverCategoryToAxTaskLabel("development")).toBe("Development");
    expect(mapNodeWeaverCategoryToAxTaskLabel("FINANCE")).toBe("Finance");
  });

  it("returns null for unknown NW labels", () => {
    expect(mapNodeWeaverCategoryToAxTaskLabel("")).toBe(null);
    expect(mapNodeWeaverCategoryToAxTaskLabel("   ")).toBe(null);
    expect(mapNodeWeaverCategoryToAxTaskLabel("QuantumFlux")).toBe(null);
  });
});
