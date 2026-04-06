import { describe, expect, it } from "vitest";
import { applyFeedbackFilters, buildFeedbackCsv, type FeedbackInboxItem } from "./feedback-inbox-utils";

const sample: FeedbackInboxItem[] = [
  {
    id: "a",
    createdAt: "2026-04-03T08:00:00.000Z",
    actorUserId: "u1",
    messageLength: 100,
    attachments: 1,
    classification: "Support",
    priority: "high",
    sentiment: "negative",
    tags: ["bug", "auth-security"],
    recommendedActions: ["Triage quickly"],
    classifierSource: "priority_engine",
    classifierFallbackLayer: 2,
    classifierConfidence: 0.72,
    reviewed: false,
    reviewedAt: null,
    reviewedBy: null,
  },
  {
    id: "b",
    createdAt: "2026-04-03T09:00:00.000Z",
    actorUserId: "u2",
    messageLength: 120,
    attachments: 0,
    classification: "General",
    priority: "critical",
    sentiment: "neutral",
    tags: ["backend"],
    recommendedActions: ["Escalate immediately to on-call owner."],
    classifierSource: "keyword_fallback",
    classifierFallbackLayer: 3,
    classifierConfidence: 0.55,
    reviewed: true,
    reviewedAt: "2026-04-03T10:00:00.000Z",
    reviewedBy: "admin-1",
  },
];

describe("feedback-inbox-utils", () => {
  it("filters and sorts critical-first", () => {
    const result = applyFeedbackFilters(
      sample,
      {
        priority: "all",
        reviewed: "all",
        reviewer: "all",
        tagQuery: "",
        sort: "critical-first",
      },
      "admin-1",
    );
    expect(result[0].id).toBe("b");
  });

  it("filters reviewed-by-me", () => {
    const result = applyFeedbackFilters(
      sample,
      {
        priority: "all",
        reviewed: "reviewed",
        reviewer: "me",
        tagQuery: "",
        sort: "newest",
      },
      "admin-1",
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b");
  });

  it("builds CSV header and values", () => {
    const csv = buildFeedbackCsv(sample);
    expect(csv).toContain("\"id\",\"createdAt\",\"actorUserId\",\"channel\"");
    expect(csv).toContain("\"a\"");
    expect(csv).toContain("\"b\"");
  });
});
