export type NodeWeaverBatchResponse = {
  results?: Array<{
    predicted_category?: string;
    confidence_score?: number;
  }>;
};

function stripJsonMarkdownFence(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

async function parseLooseJsonResponse(response: globalThis.Response, source: string): Promise<unknown> {
  const raw = await response.text();
  const normalized = stripJsonMarkdownFence(raw);
  if (!normalized) return null;
  try {
    return JSON.parse(normalized);
  } catch {
    const preview = normalized.slice(0, 140).replace(/\s+/g, " ");
    throw new Error(
      `${source} returned invalid JSON payload (preview: ${preview || "<empty>"}).`,
    );
  }
}

/**
 * Batch classify via NodeWeaver HTTP API (same contract as premium bundle routes).
 */
export async function callNodeWeaverBatchClassify(
  items: Array<{ id: string; activity: string; notes?: string }>,
  init?: Pick<RequestInit, "signal">,
): Promise<NodeWeaverBatchResponse> {
  const baseUrl = process.env.NODEWEAVER_URL;
  if (!baseUrl) {
    throw new Error("NODEWEAVER_URL is not configured");
  }
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/v1/classify/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tasks: items.map((item) => ({
        activity: item.activity,
        notes: item.notes || "",
        metadata: { classification_profile: "axtask" },
      })),
      metadata: { classification_profile: "axtask" },
    }),
    signal: init?.signal,
  });
  if (!response.ok) {
    throw new Error(`NodeWeaver classify failed with status ${response.status}`);
  }
  const parsed = await parseLooseJsonResponse(response, "NodeWeaver classify");
  if (!parsed || typeof parsed !== "object") {
    throw new Error("NodeWeaver classify returned an empty or non-object payload.");
  }
  return parsed as NodeWeaverBatchResponse;
}
