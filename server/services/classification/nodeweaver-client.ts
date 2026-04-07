/**
 * AxTask-side NodeWeaver integration (HTTP client only).
 *
 * Runtime inference is always via HTTP: point `NODEWEAVER_URL` at a running NodeWeaver
 * (Compose profile `nodeweaver` builds from the **`NodeWeaver/` git submodule**, or use any
 * compatible deployment). This module is the in-app client only. Batch is used for single-task calls too.
 */

const NODEWEAVER_DEFAULT_TIMEOUT_MS = 2000;

export async function callNodeWeaverBatchClassify(
  items: Array<{ id: string; activity: string; notes?: string }>,
  options?: { signal?: AbortSignal },
): Promise<unknown> {
  const baseUrl = process.env.NODEWEAVER_URL;
  if (!baseUrl) {
    throw new Error("NODEWEAVER_URL is not configured");
  }
  let signal = options?.signal;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let ownController: AbortController | undefined;
  if (!signal) {
    ownController = new AbortController();
    signal = ownController.signal;
    timeoutId = setTimeout(() => ownController!.abort(), NODEWEAVER_DEFAULT_TIMEOUT_MS);
  }
  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/v1/classify/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
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
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
  if (!response.ok) {
    throw new Error(`NodeWeaver classify failed with status ${response.status}`);
  }
  return response.json();
}

const NODEWEAVER_CORRECT_TIMEOUT_MS = 3500;
const NODEWEAVER_CORRECT_TEXT_MAX = 8000;

/**
 * Sends a user correction to NodeWeaver's RAG layer (`POST /api/v1/correct`) so the service can learn.
 * No-ops when `NODEWEAVER_URL` is unset. Swallows network errors (best-effort).
 */
export async function notifyNodeWeaverCorrection(
  text: string,
  correctCategory: string,
  options?: { previousCategory?: string; signal?: AbortSignal },
): Promise<void> {
  const baseUrl = process.env.NODEWEAVER_URL;
  const trimmed = text.trim();
  const category = correctCategory.trim();
  if (!baseUrl || !trimmed || !category) return;

  let signal = options?.signal;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let ownController: AbortController | undefined;
  if (!signal) {
    ownController = new AbortController();
    signal = ownController.signal;
    timeoutId = setTimeout(() => ownController!.abort(), NODEWEAVER_CORRECT_TIMEOUT_MS);
  }

  const payload: Record<string, unknown> = {
    text: trimmed.length > NODEWEAVER_CORRECT_TEXT_MAX ? trimmed.slice(0, NODEWEAVER_CORRECT_TEXT_MAX) : trimmed,
    correct_category: category,
    metadata: { classification_profile: "axtask" },
  };
  if (options?.previousCategory?.trim()) {
    (payload.metadata as Record<string, unknown>).previous_category = options.previousCategory.trim();
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/v1/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      /* best-effort learning signal */
    }
  } catch {
    /* optional at runtime */
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
