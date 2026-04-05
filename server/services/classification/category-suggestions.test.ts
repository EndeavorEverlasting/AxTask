// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./nodeweaver-client", () => ({
  callNodeWeaverBatchClassify: vi.fn(),
}));

vi.mock("./universal-classifier", () => ({
  classifyWithFallback: vi.fn(),
}));

import { buildCategorySuggestions } from "./category-suggestions";
import { callNodeWeaverBatchClassify } from "./nodeweaver-client";
import { classifyWithFallback } from "./universal-classifier";

describe("category-suggestions", () => {
  const origNw = process.env.NODEWEAVER_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODEWEAVER_URL = "http://nodeweaver.test";
  });

  afterEach(() => {
    if (origNw === undefined) delete process.env.NODEWEAVER_URL;
    else process.env.NODEWEAVER_URL = origNw;
  });

  it("merges NodeWeaver prediction, structured alternatives, and local classifier", async () => {
    vi.mocked(callNodeWeaverBatchClassify).mockResolvedValue({
      results: [
        {
          predicted_category: "Research",
          confidence_score: 0.88,
          alternatives: ["Development", { category: "Meeting" }, { label: "Maintenance" }],
        },
      ],
    });
    vi.mocked(classifyWithFallback).mockResolvedValue({
      classification: "General",
      confidence: 0.5,
      source: "keyword_fallback",
      fallbackLayer: 2,
    });

    const suggestions = await buildCategorySuggestions("literature review", "");

    const labels = suggestions.map((s) => s.label);
    expect(labels).toContain("Research");
    expect(labels).toContain("Development");
    expect(labels).toContain("Meeting");
    expect(labels).toContain("Maintenance");
    expect(labels).toContain("General");
    expect(suggestions[0].label).toBe("Research");
    expect(suggestions[0].source).toBe("nodeweaver");
  });

  it("does not call NodeWeaver when NODEWEAVER_URL is unset", async () => {
    delete process.env.NODEWEAVER_URL;
    vi.mocked(classifyWithFallback).mockResolvedValue({
      classification: "Crisis",
      confidence: 0.72,
      source: "priority_engine",
      fallbackLayer: 1,
    });

    const suggestions = await buildCategorySuggestions("medical emergency on site", "");

    expect(callNodeWeaverBatchClassify).not.toHaveBeenCalled();
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].label).toBe("Crisis");
    expect(suggestions[0].source).toBe("axtask");
  });

  it("continues with local suggestions when NodeWeaver batch fails", async () => {
    process.env.NODEWEAVER_URL = "http://nodeweaver.test";
    vi.mocked(callNodeWeaverBatchClassify).mockRejectedValue(new Error("network down"));
    vi.mocked(classifyWithFallback).mockResolvedValue({
      classification: "Administrative",
      confidence: 0.55,
      source: "keyword_fallback",
      fallbackLayer: 2,
    });

    const suggestions = await buildCategorySuggestions("sign paperwork", "");

    expect(suggestions.map((s) => s.label)).toContain("Administrative");
  });

  it("dedupes labels case-insensitively keeping the highest confidence", async () => {
    vi.mocked(callNodeWeaverBatchClassify).mockResolvedValue({
      results: [{ predicted_category: "research", confidence_score: 0.6 }],
    });
    vi.mocked(classifyWithFallback).mockResolvedValue({
      classification: "Research",
      confidence: 0.95,
      source: "priority_engine",
      fallbackLayer: 1,
    });

    const suggestions = await buildCategorySuggestions("paper", "");

    const research = suggestions.filter((s) => s.label.toLowerCase() === "research");
    expect(research).toHaveLength(1);
    expect(research[0].confidence).toBe(0.95);
  });
});
