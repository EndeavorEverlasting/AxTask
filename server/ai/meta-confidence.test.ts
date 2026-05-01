// @vitest-environment node
import { describe, expect, it } from "vitest";
import { aiConfidenceMeta } from "./meta-confidence";

describe("aiConfidenceMeta", () => {
  it("scores rule_parser non-clarification intents higher", () => {
    const out = aiConfidenceMeta({ provider: "rule_parser", intentType: "create_reminder" });
    expect(out.confidence).toBe(0.95);
    expect(out.fallbackLayer).toBe("rule_parser");
  });

  it("scores clarification lower", () => {
    const out = aiConfidenceMeta({ provider: "rule_parser", intentType: "clarification" });
    expect(out.confidence).toBe(0.4);
    expect(out.fallbackLayer).toBe("rule_parser");
  });

  it("scores LLM intents moderately", () => {
    const out = aiConfidenceMeta({ provider: "openai", intentType: "create_task" });
    expect(out.confidence).toBe(0.75);
    expect(out.fallbackLayer).toBe("llm");
  });
});
