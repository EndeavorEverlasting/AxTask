import { describe, expect, it } from "vitest";
import {
  extractShoppingListItemsForVoice,
  isShoppingTask,
  isShoppingVoiceUtterance,
  stripAvatarDelegationPhrase,
  stripTrailingShoppingListFromActivity,
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
