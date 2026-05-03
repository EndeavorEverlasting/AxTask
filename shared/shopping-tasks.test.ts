import { describe, expect, it } from "vitest";
import {
  detectShoppingListContent,
  extractShoppingListItemsForVoice,
  isShoppingTask,
  isShoppingVoiceUtterance,
  stripAvatarDelegationPhrase,
  stripTrailingShoppingListFromActivity,
  withNodeWeaverShoppingDetection,
} from "./shopping-tasks";

describe("stripAvatarDelegationPhrase", () => {
  it("strips avatar delegation prefix", () => {
    const r = stripAvatarDelegationPhrase("get the avatar to add milk");
    expect(r.delegation).toBe(true);
    expect(r.text).toBe("add milk");
  });

  it("leaves plain text", () => {
    const r = stripAvatarDelegationPhrase("add milk to shopping list");
    expect(r.delegation).toBe(false);
    expect(r.text).toBe("add milk to shopping list");
  });
});

describe("isShoppingVoiceUtterance", () => {
  it("detects shopping list keyword", () => {
    expect(isShoppingVoiceUtterance("add milk to my shopping list")).toBe(true);
  });

  it("detects multi buy pattern", () => {
    expect(isShoppingVoiceUtterance("buy milk and eggs")).toBe(true);
  });
});

describe("extractShoppingListItemsForVoice", () => {
  it("parses comma-separated items with list suffix", () => {
    const items = extractShoppingListItemsForVoice("add milk, eggs, and bread to my shopping list");
    expect(items).toEqual(["milk", "eggs", "bread"]);
  });

  it("parses buy X and Y", () => {
    expect(extractShoppingListItemsForVoice("buy milk and eggs")).toEqual(["milk", "eggs"]);
  });

  it("keeps mac and cheese as one item", () => {
    expect(extractShoppingListItemsForVoice("buy mac and cheese")).toEqual(["mac and cheese"]);
  });
});

describe("stripTrailingShoppingListFromActivity", () => {
  it("strips trailing list phrase", () => {
    expect(stripTrailingShoppingListFromActivity("milk to my shopping list")).toBe("milk");
  });
});

describe("isShoppingTask", () => {
  it("matches classification Shopping", () => {
    expect(isShoppingTask({ classification: "Shopping", activity: "x", notes: "" })).toBe(true);
  });

  it("matches heuristic", () => {
    expect(isShoppingTask({ classification: "General", activity: "buy soap", notes: "" })).toBe(true);
  });

  it("does not treat generic errand as shopping", () => {
    expect(isShoppingTask({ classification: "General", activity: "bank errand", notes: "" })).toBe(false);
  });
});

describe("detectShoppingListContent", () => {
  it("detects markdown checklist format", () => {
    const d = detectShoppingListContent(
      "Shopping list",
      "- [ ] milk\n- [x] eggs\n- [ ] bread",
    );
    expect(d.detected).toBe(true);
    expect(d.format).toBe("markdown_checklist");
    expect(d.items).toEqual(["milk", "eggs", "bread"]);
  });

  it("detects plain bullet list format", () => {
    const d = detectShoppingListContent(
      "buy for weekend",
      "- soap\n* toothpaste\n• paper towels",
    );
    expect(d.detected).toBe(true);
    expect(d.format).toBe("bullet_lines");
    expect(d.items).toEqual(["soap", "toothpaste", "paper towels"]);
  });

  it("detects numbered list format", () => {
    const d = detectShoppingListContent(
      "grocery run",
      "1. milk\n2) eggs\n3. bananas",
    );
    expect(d.detected).toBe(true);
    expect(d.format).toBe("numbered_lines");
    expect(d.items).toEqual(["milk", "eggs", "bananas"]);
  });

  it("detects title + line format", () => {
    const d = detectShoppingListContent(
      "Weekend prep",
      "Shopping List:\nmilk\neggs\nbread",
    );
    expect(d.detected).toBe(true);
    expect(d.format).toBe("title_plus_lines");
    expect(d.items).toEqual(["milk", "eggs", "bread"]);
  });

  it("detects comma/and list format", () => {
    const d = detectShoppingListContent(
      "buy milk, eggs, and bread",
      "",
    );
    expect(d.detected).toBe(true);
    expect(d.format).toBe("comma_or_and");
    expect(d.items).toEqual(["milk", "eggs", "bread"]);
  });
});

describe("withNodeWeaverShoppingDetection", () => {
  it("promotes low-confidence local parse when nodeweaver indicates shopping", () => {
    const base = detectShoppingListContent("Need: milk, eggs", "");
    const enhanced = withNodeWeaverShoppingDetection(base, {
      category: "shopping_checklist",
      confidence: 0.81,
      suggestedItems: ["milk", "eggs"],
    });
    expect(enhanced.detected).toBe(true);
    expect(enhanced.source).toBe("nodeweaver_rag");
    expect(enhanced.items).toEqual(["milk", "eggs"]);
  });
});
