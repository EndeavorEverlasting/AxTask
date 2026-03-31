import { describe, it, expect, beforeEach, vi } from "vitest";

const CLASSIFY_HINT_KEY = "axtask_classify_hint_seen";

const CATEGORIES = [
  { label: "Crisis", coins: 15 },
  { label: "Research", coins: 12 },
  { label: "Development", coins: 10 },
  { label: "Meeting", coins: 8 },
  { label: "Maintenance", coins: 8 },
  { label: "Administrative", coins: 6 },
  { label: "General", coins: 0 },
] as const;

function getClassificationColor(classification: string) {
  switch (classification) {
    case "Crisis":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    case "Development":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "Meeting":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "Administrative":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    case "Research":
      return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400";
    case "Maintenance":
      return "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-300";
  }
}

describe("ClassificationBadge logic", () => {
  describe("getClassificationColor", () => {
    it("returns red classes for Crisis", () => {
      const color = getClassificationColor("Crisis");
      expect(color).toContain("bg-red");
      expect(color).toContain("text-red");
    });

    it("returns blue classes for Development", () => {
      expect(getClassificationColor("Development")).toContain("bg-blue");
    });

    it("returns green classes for Meeting", () => {
      expect(getClassificationColor("Meeting")).toContain("bg-green");
    });

    it("returns purple classes for Administrative", () => {
      expect(getClassificationColor("Administrative")).toContain("bg-purple");
    });

    it("returns indigo classes for Research", () => {
      expect(getClassificationColor("Research")).toContain("bg-indigo");
    });

    it("returns teal classes for Maintenance", () => {
      expect(getClassificationColor("Maintenance")).toContain("bg-teal");
    });

    it("returns gray classes for General/unknown", () => {
      expect(getClassificationColor("General")).toContain("bg-gray");
      expect(getClassificationColor("SomethingElse")).toContain("bg-gray");
    });

    it("includes dark mode classes for all categories", () => {
      for (const cat of CATEGORIES) {
        expect(getClassificationColor(cat.label)).toContain("dark:");
      }
    });

    it("each category maps to a unique color set", () => {
      const colors = CATEGORIES.map(c => getClassificationColor(c.label));
      const unique = new Set(colors);
      expect(unique.size).toBe(CATEGORIES.length);
    });
  });

  describe("hint persistence logic", () => {
    let store: Record<string, string> = {};

    beforeEach(() => {
      store = {};
    });

    function shouldShowHint(editable: boolean, hintDismissedThisSession: boolean): boolean {
      if (!editable || hintDismissedThisSession) return false;
      return store[CLASSIFY_HINT_KEY] !== "true";
    }

    function dismissHint() {
      store[CLASSIFY_HINT_KEY] = "true";
    }

    it("shows hint for first-time editable badge", () => {
      expect(shouldShowHint(true, false)).toBe(true);
    });

    it("does not show hint for non-editable badge", () => {
      expect(shouldShowHint(false, false)).toBe(false);
    });

    it("does not show hint after localStorage dismissal", () => {
      dismissHint();
      expect(shouldShowHint(true, false)).toBe(false);
    });

    it("does not show hint after session-level dismissal", () => {
      expect(shouldShowHint(true, true)).toBe(false);
    });

    it("dismissHint sets localStorage key", () => {
      expect(store[CLASSIFY_HINT_KEY]).toBeUndefined();
      dismissHint();
      expect(store[CLASSIFY_HINT_KEY]).toBe("true");
    });

    it("clearing storage re-enables hint", () => {
      dismissHint();
      expect(shouldShowHint(true, false)).toBe(false);
      store = {};
      expect(shouldShowHint(true, false)).toBe(true);
    });
  });

  describe("claim logic (single hint per list)", () => {
    let hintClaimedBy: string | null = null;
    let hintDismissedThisSession = false;

    beforeEach(() => {
      hintClaimedBy = null;
      hintDismissedThisSession = false;
    });

    function canClaimHint(taskId: string): boolean {
      if (hintDismissedThisSession) return false;
      if (hintClaimedBy && hintClaimedBy !== taskId) return false;
      return true;
    }

    function claimHint(taskId: string) {
      hintClaimedBy = taskId;
    }

    function dismissHintSession() {
      hintDismissedThisSession = true;
    }

    it("first badge can claim hint", () => {
      expect(canClaimHint("task-1")).toBe(true);
      claimHint("task-1");
      expect(hintClaimedBy).toBe("task-1");
    });

    it("second badge cannot claim when first holds it", () => {
      claimHint("task-1");
      expect(canClaimHint("task-2")).toBe(false);
    });

    it("same badge can re-check its own claim", () => {
      claimHint("task-1");
      expect(canClaimHint("task-1")).toBe(true);
    });

    it("no badge can claim after session dismissal", () => {
      dismissHintSession();
      expect(canClaimHint("task-1")).toBe(false);
      expect(canClaimHint("task-2")).toBe(false);
    });
  });

  describe("CATEGORIES structure", () => {
    it("has 7 categories", () => {
      expect(CATEGORIES).toHaveLength(7);
    });

    it("Crisis has highest coin reward (15)", () => {
      expect(CATEGORIES[0]).toEqual({ label: "Crisis", coins: 15 });
    });

    it("General has zero coins", () => {
      expect(CATEGORIES.find(c => c.label === "General")?.coins).toBe(0);
    });

    it("all non-General categories have positive coins", () => {
      const nonGeneral = CATEGORIES.filter(c => c.label !== "General");
      expect(nonGeneral.every(c => c.coins > 0)).toBe(true);
    });

    it("coins are in descending order", () => {
      for (let i = 0; i < CATEGORIES.length - 1; i++) {
        expect(CATEGORIES[i].coins).toBeGreaterThanOrEqual(CATEGORIES[i + 1].coins);
      }
    });
  });
});
