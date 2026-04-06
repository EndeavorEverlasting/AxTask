/**
 * AxTask-side NodeWeaver integration (HTTP client only).
 *
 * The NodeWeaver inference service is not vendored inside this repository; it runs as a
 * separate deployable. Point `NODEWEAVER_URL` at that service. This module is the in-app
 * integration surface. Batch is used for single-task calls too.
 */

export async function callNodeWeaverBatchClassify(
  items: Array<{ id: string; activity: string; notes?: string }>,
  options?: { signal?: AbortSignal },
): Promise<unknown> {
  const baseUrl = process.env.NODEWEAVER_URL;
  if (!baseUrl) {
    throw new Error("NODEWEAVER_URL is not configured");
  }
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/v1/classify/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: options?.signal,
    body: JSON.stringify({
      tasks: items.map((item) => ({
        id: item.id,
        activity: item.activity,
        notes: item.notes || "",
        metadata: { classification_profile: "axtask" },
      })),
      metadata: { classification_profile: "axtask" },
    }),
  });
  if (!response.ok) {
    throw new Error(`NodeWeaver classify failed with status ${response.status}`);
  }
  return response.json();
}
