// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  parseFeedbackPayload,
  parseFeedbackReviewPayload,
} from "./services/feedback-inbox-parser";

describe("feedback inbox storage", () => {
  it("parses feedback payload JSON into normalized inbox data", () => {
    const parsed = parseFeedbackPayload(
      JSON.stringify({
        messageLength: 120,
        attachments: 1,
        analysis: {
          classification: "Support",
          priority: "high",
          sentiment: "negative",
          tags: ["bug"],
          recommendedActions: ["Triage quickly"],
          classifier: { source: "keyword_fallback", fallbackLayer: 2, confidence: 0.61 },
        },
      }),
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.classification).toBe("Support");
    expect(parsed?.priority).toBe("high");
    expect(parsed?.classifierFallbackLayer).toBe(2);
  });

  it("parses feedback review payload JSON", () => {
    const parsed = parseFeedbackReviewPayload(
      JSON.stringify({
        feedbackEventId: "abc123",
        reviewed: true,
      }),
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.feedbackEventId).toBe("abc123");
    expect(parsed?.reviewed).toBe(true);
  });
});
