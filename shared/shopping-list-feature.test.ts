// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  computeShoppingListUnlocked,
  DENDRITIC_SHOPPING_LIST_SKILL_KEY,
} from "./shopping-list-feature";

describe("computeShoppingListUnlocked", () => {
  it("is false when dendritic node missing or at level 0", () => {
    expect(computeShoppingListUnlocked([])).toBe(false);
    expect(
      computeShoppingListUnlocked([
        { skillKey: DENDRITIC_SHOPPING_LIST_SKILL_KEY, currentLevel: 0 },
      ]),
    ).toBe(false);
    expect(computeShoppingListUnlocked([{ skillKey: "export-efficiency", currentLevel: 1 }])).toBe(false);
  });

  it("is true when dendritic node has positive level", () => {
    expect(
      computeShoppingListUnlocked([
        { skillKey: DENDRITIC_SHOPPING_LIST_SKILL_KEY, currentLevel: 1 },
      ]),
    ).toBe(true);
  });
});
