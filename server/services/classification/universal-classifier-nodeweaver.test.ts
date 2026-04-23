// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

describe("universal-classifier NodeWeaver path", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("./nodeweaver-client");
    vi.clearAllMocks();
  });

  it("classifies via NodeWeaver when batch maps to Shopping", async () => {
    vi.doMock("./nodeweaver-client", () => ({
      callNodeWeaverBatchClassify: vi.fn().mockResolvedValue({
        results: [{ predicted_category: "supermarket_visit", confidence_score: 0.88 }],
      }),
    }));
    const prevU = process.env.UNIVERSAL_CLASSIFIER_API_URL;
    const prevN = process.env.NODEWEAVER_URL;
    process.env.UNIVERSAL_CLASSIFIER_API_URL = "";
    process.env.NODEWEAVER_URL = "http://mock-nodeweaver.local";
    try {
      vi.resetModules();
      const { classifyWithFallback, classifyWithAssociations } = await import("./universal-classifier");
      const result = await classifyWithFallback("weekly staples", "", { preferExternal: true });
      expect(result.source).toBe("nodeweaver");
      expect(result.classification).toBe("Shopping");
      const { result: r2, associations } = await classifyWithAssociations("milk", "", { preferExternal: true });
      expect(r2.source).toBe("nodeweaver");
      expect(associations[0]).toEqual({ label: "Shopping", confidence: 0.88 });
    } finally {
      if (prevU === undefined) delete process.env.UNIVERSAL_CLASSIFIER_API_URL;
      else process.env.UNIVERSAL_CLASSIFIER_API_URL = prevU;
      if (prevN === undefined) delete process.env.NODEWEAVER_URL;
      else process.env.NODEWEAVER_URL = prevN;
    }
  });

  it("falls through when NodeWeaver batch rejects", async () => {
    vi.doMock("./nodeweaver-client", () => ({
      callNodeWeaverBatchClassify: vi.fn().mockRejectedValue(new Error("down")),
    }));
    const prevU = process.env.UNIVERSAL_CLASSIFIER_API_URL;
    const prevN = process.env.NODEWEAVER_URL;
    process.env.UNIVERSAL_CLASSIFIER_API_URL = "";
    process.env.NODEWEAVER_URL = "http://mock-nodeweaver.local";
    try {
      vi.resetModules();
      const { classifyWithFallback } = await import("./universal-classifier");
      const result = await classifyWithFallback("fix login issue", "", { preferExternal: true });
      expect(result.source).not.toBe("nodeweaver");
      expect(result.classification.length).toBeGreaterThan(0);
    } finally {
      if (prevU === undefined) delete process.env.UNIVERSAL_CLASSIFIER_API_URL;
      else process.env.UNIVERSAL_CLASSIFIER_API_URL = prevU;
      if (prevN === undefined) delete process.env.NODEWEAVER_URL;
      else process.env.NODEWEAVER_URL = prevN;
    }
  });
});
