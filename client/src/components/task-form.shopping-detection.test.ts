// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { pickShoppingPretextQuip, resolveShoppingConversionSuggestion } from "./task-form";

describe("resolveShoppingConversionSuggestion", () => {
  it("returns a conversion suggestion for markdown checklist shopping text", () => {
    const suggestion = resolveShoppingConversionSuggestion(
      "Shopping list",
      "- [ ] milk\n- [ ] eggs",
    );
    expect(suggestion).not.toBeNull();
    expect(suggestion?.format).toBe("markdown_checklist");
    expect(suggestion?.items).toEqual(["milk", "eggs"]);
  });

  it("returns null when notes are not a shopping list", () => {
    const suggestion = resolveShoppingConversionSuggestion(
      "Weekly notes",
      "- finalize proposal\n- schedule standup",
    );
    expect(suggestion).toBeNull();
  });

  it("picks a stable Pretext quip for the same seed", () => {
    const a = pickShoppingPretextQuip("seed-a");
    const b = pickShoppingPretextQuip("seed-a");
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });
});
