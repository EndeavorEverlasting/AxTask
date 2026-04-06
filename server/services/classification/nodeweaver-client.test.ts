// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { callNodeWeaverBatchClassify, notifyNodeWeaverCorrection } from "./nodeweaver-client";

describe("nodeweaver-client", () => {
  const origUrl = process.env.NODEWEAVER_URL;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (origUrl === undefined) delete process.env.NODEWEAVER_URL;
    else process.env.NODEWEAVER_URL = origUrl;
  });

  it("throws when NODEWEAVER_URL is not set", async () => {
    delete process.env.NODEWEAVER_URL;
    await expect(callNodeWeaverBatchClassify([{ id: "1", activity: "test" }])).rejects.toThrow(
      "NODEWEAVER_URL is not configured",
    );
  });

  it("POSTs axtask batch contract to trimmed base URL", async () => {
    process.env.NODEWEAVER_URL = "https://nw.example.com///";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ predicted_category: "Meeting" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await callNodeWeaverBatchClassify([
      { id: "t1", activity: "standup", notes: "daily" },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://nw.example.com/api/v1/classify/batch");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.tasks).toEqual([
      {
        id: "t1",
        activity: "standup",
        notes: "daily",
        metadata: { classification_profile: "axtask" },
      },
    ]);
    expect(body.metadata).toEqual({ classification_profile: "axtask" });
    expect(out).toEqual({ results: [{ predicted_category: "Meeting" }] });
  });

  it("notifyNodeWeaverCorrection is a no-op when NODEWEAVER_URL is unset", async () => {
    delete process.env.NODEWEAVER_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await notifyNodeWeaverCorrection("fix the bug", "Development");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("notifyNodeWeaverCorrection POSTs /api/v1/correct with axtask metadata", async () => {
    process.env.NODEWEAVER_URL = "http://nw.local/";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal("fetch", fetchMock);
    await notifyNodeWeaverCorrection("ship release", "Meeting", { previousCategory: "General" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://nw.local/api/v1/correct");
    const body = JSON.parse(init.body as string);
    expect(body.text).toBe("ship release");
    expect(body.correct_category).toBe("Meeting");
    expect(body.metadata).toEqual({
      classification_profile: "axtask",
      previous_category: "General",
    });
  });

  it("throws when response is not ok", async () => {
    process.env.NODEWEAVER_URL = "http://localhost:9999";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
      }),
    );
    await expect(callNodeWeaverBatchClassify([{ id: "1", activity: "a" }])).rejects.toThrow(
      "NodeWeaver classify failed with status 502",
    );
  });
});
