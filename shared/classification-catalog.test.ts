import { describe, expect, it } from "vitest";
import {
  BUILT_IN_CLASSIFICATIONS,
  builtInCoinReward,
  isBuiltInClassification,
  isGeneralClassification,
  normalizeCategoryName,
} from "./classification-catalog";

describe("classification-catalog", () => {
  it("lists seven built-in categories", () => {
    expect(BUILT_IN_CLASSIFICATIONS).toHaveLength(7);
  });

  it("detects built-ins case-insensitively", () => {
    expect(isBuiltInClassification("Crisis")).toBe(true);
    expect(isBuiltInClassification("crisis")).toBe(true);
    expect(isBuiltInClassification("  Research  ")).toBe(true);
    expect(isBuiltInClassification("Support")).toBe(false);
  });

  it("returns coin rewards for built-ins case-insensitively", () => {
    expect(builtInCoinReward("Crisis")).toBe(15);
    expect(builtInCoinReward("general")).toBe(0);
    expect(builtInCoinReward("Unknown")).toBeUndefined();
  });

  it("normalizes whitespace in category names", () => {
    expect(normalizeCategoryName("  a   b  ")).toBe("a b");
    expect(normalizeCategoryName("trim")).toBe("trim");
  });

  it("detects General case-insensitively", () => {
    expect(isGeneralClassification("General")).toBe(true);
    expect(isGeneralClassification(" general ")).toBe(true);
    expect(isGeneralClassification("Crisis")).toBe(false);
  });
});
