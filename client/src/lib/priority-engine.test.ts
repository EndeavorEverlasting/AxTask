import { describe, it, expect } from "vitest";
import { PriorityEngine } from "./priority-engine";

describe("PriorityEngine", () => {
  describe("scoreToPriority", () => {
    it("returns Highest for score >= 8", () => {
      expect(PriorityEngine.scoreToPriority(8)).toBe("Highest");
      expect(PriorityEngine.scoreToPriority(10)).toBe("Highest");
    });
    it("returns High for score >= 6", () => {
      expect(PriorityEngine.scoreToPriority(6)).toBe("High");
      expect(PriorityEngine.scoreToPriority(7.5)).toBe("High");
    });
    it("returns Medium-High for score >= 4", () => {
      expect(PriorityEngine.scoreToPriority(4)).toBe("Medium-High");
      expect(PriorityEngine.scoreToPriority(5)).toBe("Medium-High");
    });
    it("returns Medium for score >= 2", () => {
      expect(PriorityEngine.scoreToPriority(2)).toBe("Medium");
      expect(PriorityEngine.scoreToPriority(3)).toBe("Medium");
    });
    it("returns Low for score < 2", () => {
      expect(PriorityEngine.scoreToPriority(0)).toBe("Low");
      expect(PriorityEngine.scoreToPriority(1)).toBe("Low");
    });
  });

  describe("classifyTask", () => {
    it("classifies development tasks", () => {
      expect(PriorityEngine.classifyTask("fix login bug", "")).toBe("Development");
      expect(PriorityEngine.classifyTask("deploy app", "")).toBe("Development");
      expect(PriorityEngine.classifyTask("debug issue", "code review")).toBe("Development");
    });
    it("classifies meetings", () => {
      expect(PriorityEngine.classifyTask("team meeting", "")).toBe("Meeting");
      expect(PriorityEngine.classifyTask("standup", "daily sync")).toBe("Meeting");
    });
    it("classifies research", () => {
      expect(PriorityEngine.classifyTask("research options", "")).toBe("Research");
      expect(PriorityEngine.classifyTask("investigate issue", "analyze data")).toBe("Research");
    });
    it("classifies maintenance", () => {
      expect(PriorityEngine.classifyTask("install updates", "")).toBe("Maintenance");
      expect(PriorityEngine.classifyTask("configure server", "")).toBe("Maintenance");
    });
    it("classifies administrative", () => {
      expect(PriorityEngine.classifyTask("submit report", "")).toBe("Administrative");
      expect(PriorityEngine.classifyTask("approve request", "sign document")).toBe("Administrative");
    });
    it("returns General for unclassified tasks", () => {
      expect(PriorityEngine.classifyTask("buy groceries", "")).toBe("General");
    });
  });

  describe("calculatePreviewPriority", () => {
    it("returns Low for empty input", () => {
      const result = PriorityEngine.calculatePreviewPriority("", "");
      expect(result.score).toBe(0);
      expect(result.priority).toBe("Low");
    });

    it("boosts score for critical keywords", () => {
      const result = PriorityEngine.calculatePreviewPriority("submit deadline urgent", "");
      expect(result.score).toBeGreaterThanOrEqual(8);
      expect(result.priority).toBe("Highest");
    });

    it("boosts score for tags", () => {
      const result = PriorityEngine.calculatePreviewPriority("task", "@urgent");
      expect(result.score).toBeGreaterThanOrEqual(5);
    });

    it("boosts score for time sensitivity keywords", () => {
      const result = PriorityEngine.calculatePreviewPriority("do something today asap", "");
      expect(result.score).toBeGreaterThanOrEqual(6);
    });

    it("boosts score for problem indicators", () => {
      const result = PriorityEngine.calculatePreviewPriority("error in production", "broken");
      expect(result.score).toBeGreaterThanOrEqual(6);
    });

    it("uses manual urgency * impact when provided", () => {
      const result = PriorityEngine.calculatePreviewPriority("simple task", "", 5, 5);
      expect(result.score).toBeGreaterThanOrEqual(12);
    });

    it("scores non-zero with urgency only (no impact)", () => {
      const result = PriorityEngine.calculatePreviewPriority("", "", 5, null);
      expect(result.score).toBe(4);
      expect(result.priority).toBe("Medium-High");
    });

    it("scores non-zero with impact only (no urgency)", () => {
      const result = PriorityEngine.calculatePreviewPriority("", "", null, 5);
      expect(result.score).toBe(4);
      expect(result.priority).toBe("Medium-High");
    });

    it("prefers urgency*impact over single urgency when both set", () => {
      const both = PriorityEngine.calculatePreviewPriority("", "", 5, 5);
      const single = PriorityEngine.calculatePreviewPriority("", "", 5, null);
      expect(both.score).toBeGreaterThan(single.score);
    });

    it("scores everyday keywords: upgrade", () => {
      const result = PriorityEngine.calculatePreviewPriority("upgrade SSD", "");
      expect(result.score).toBeGreaterThanOrEqual(2);
      expect(result.priority).not.toBe("Low");
    });

    it("scores everyday keywords: order, schedule", () => {
      const r1 = PriorityEngine.calculatePreviewPriority("order supplies", "");
      expect(r1.score).toBeGreaterThanOrEqual(2);
      const r2 = PriorityEngine.calculatePreviewPriority("schedule dentist", "");
      expect(r2.score).toBeGreaterThanOrEqual(2);
    });

    it("scores everyday keywords: buy, pay, renew", () => {
      expect(PriorityEngine.calculatePreviewPriority("buy groceries", "").score).toBeGreaterThanOrEqual(2);
      expect(PriorityEngine.calculatePreviewPriority("pay bills", "").score).toBeGreaterThanOrEqual(3);
      expect(PriorityEngine.calculatePreviewPriority("renew license", "").score).toBeGreaterThanOrEqual(3);
    });

    it("applies effort penalty for effort > 3", () => {
      const withoutEffort = PriorityEngine.calculatePreviewPriority("urgent deadline", "", null, null, null);
      const withHighEffort = PriorityEngine.calculatePreviewPriority("urgent deadline", "", null, null, 4);
      expect(withHighEffort.score).toBeLessThan(withoutEffort.score);
    });
  });

  describe("calculatePriority (async)", () => {
    it("returns a PriorityResult", async () => {
      const result = await PriorityEngine.calculatePriority("fix bug", "error");
      expect(result).toHaveProperty("score");
      expect(result).toHaveProperty("priority");
      expect(result).toHaveProperty("isRepeated");
    });

    it("scores non-zero with urgency only", async () => {
      const result = await PriorityEngine.calculatePriority("", "", 5, null);
      expect(result.score).toBe(4);
      expect(result.priority).toBe("Medium-High");
    });

    it("scores non-zero with impact only", async () => {
      const result = await PriorityEngine.calculatePriority("", "", null, 5);
      expect(result.score).toBe(4);
      expect(result.priority).toBe("Medium-High");
    });

    it("scores everyday keywords in async path", async () => {
      const result = await PriorityEngine.calculatePriority("upgrade SSD", "");
      expect(result.score).toBeGreaterThanOrEqual(2);
    });

    it("detects repetition with similar existing tasks", async () => {
      const existing = Array.from({ length: 5 }, (_, i) => ({
        id: String(i),
        activity: "fix the login bug",
        notes: "error in auth module",
        date: "2025-01-01",
        status: "pending",
        time: null,
        urgency: null,
        impact: null,
        effort: null,
        prerequisites: null,
        priorityScore: null,
        priority: null,
        classification: null,
        sortOrder: i,
        userId: null,
        createdAt: new Date().toISOString(),
      })) as any[];

      const result = await PriorityEngine.calculatePriority(
        "fix the login bug", "error in auth module", null, null, null, existing
      );
      expect(result.isRepeated).toBe(true);
    });
  });
});

