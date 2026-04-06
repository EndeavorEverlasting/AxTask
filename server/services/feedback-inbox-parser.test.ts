// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseFeedbackPayload } from "./feedback-inbox-parser";

describe("feedback-inbox-parser privacy", () => {
  it("does not expose plain reporter email in parsed payload", () => {
    const rawEmail = "visitor@example.com";
    const parsed = parseFeedbackPayload(
      JSON.stringify({
        message: "Hello",
        channel: "public_contact",
        reporterEmail: rawEmail,
        messageLength: 5,
        attachments: 0,
        analysis: {
          classification: "Support",
          priority: "low",
          sentiment: "neutral",
          tags: [],
          recommendedActions: [],
          classifier: { source: "keyword_fallback", fallbackLayer: 1, confidence: 0.5 },
        },
      }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.reporterEmail).toBeDefined();
    expect(parsed?.reporterEmail).not.toBe(rawEmail);
    expect(parsed?.reporterEmail).not.toContain("visitor@");
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain(rawEmail);
  });

  it("does not expose plain reporter name in parsed payload", () => {
    const rawName = "Jordan Visitor";
    const parsed = parseFeedbackPayload(
      JSON.stringify({
        message: "Hi",
        channel: "public_contact",
        reporterName: rawName,
        messageLength: 2,
        attachments: 0,
        analysis: {
          classification: "Support",
          priority: "low",
          sentiment: "neutral",
          tags: [],
          recommendedActions: [],
          classifier: { source: "keyword_fallback", fallbackLayer: 1, confidence: 0.5 },
        },
      }),
    );
    expect(parsed?.reporterName).toBeDefined();
    expect(parsed?.reporterName).not.toBe(rawName);
    expect(JSON.stringify(parsed)).not.toContain("Jordan");
  });
});
