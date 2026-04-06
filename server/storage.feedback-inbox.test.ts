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

  it("parses optional message and channel for contact / inbox display", () => {
    const parsed = parseFeedbackPayload(
      JSON.stringify({
        message: "Hello from a visitor",
        channel: "public_contact",
        reporterEmail: "a@b.co",
        messageLength: 21,
        attachments: 0,
        analysis: {
          classification: "Support",
          priority: "low",
          sentiment: "neutral",
          tags: ["public-contact"],
          recommendedActions: ["Queue for normal feedback review."],
          classifier: { source: "keyword_fallback", fallbackLayer: 1, confidence: 0.5 },
        },
      }),
    );
    expect(parsed?.message).toBe("Hello from a visitor");
    expect(parsed?.channel).toBe("public_contact");
    expect(parsed?.reporterEmail).toBe("•@b.co");
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
