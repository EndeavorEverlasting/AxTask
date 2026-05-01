export type AiFallbackLayer = "rule_parser" | "llm";

/**
 * Lightweight observability for interprets/executes — not model-reported confidence.
 */
export function aiConfidenceMeta(input: {
  provider: string;
  intentType: string;
}): { confidence: number; fallbackLayer: AiFallbackLayer } {
  const { provider, intentType } = input;
  if (intentType === "clarification") {
    return {
      confidence: 0.4,
      fallbackLayer: provider === "rule_parser" ? "rule_parser" : "llm",
    };
  }
  if (provider === "rule_parser") {
    return { confidence: 0.95, fallbackLayer: "rule_parser" };
  }
  return { confidence: 0.75, fallbackLayer: "llm" };
}
