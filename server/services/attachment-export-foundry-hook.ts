import { createHmac } from "crypto";
import { ATTACHMENT_EXPORT_MANIFEST_VERSION } from "@shared/attachment-export-manifest";

export type FoundryAttachmentExportPayload = {
  event: "attachment_export.completed";
  schemaVersion: typeof ATTACHMENT_EXPORT_MANIFEST_VERSION;
  exportRunId: string;
  exportedAt: string;
  assetCount: number;
  bytesCopied: number;
  missingFileCount: number;
  manifestSha256: string;
  environment: string;
};

/**
 * Optional Foundry collector hook: POST JSON metadata only (no attachment bytes).
 * Requires both FOUNDRY_WEBHOOK_URL and FOUNDRY_WEBHOOK_SECRET.
 */
export async function notifyFoundryAttachmentExportCompleted(
  payload: FoundryAttachmentExportPayload,
): Promise<void> {
  const url = process.env.FOUNDRY_WEBHOOK_URL?.trim();
  const secret = process.env.FOUNDRY_WEBHOOK_SECRET?.trim();
  if (!url || !secret) return;

  const body = JSON.stringify(payload);
  const sig = createHmac("sha256", secret).update(body).digest("hex");

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AxTask-Signature": `sha256=${sig}`,
      },
      body,
      signal: ac.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    console.warn(`[foundry-webhook] attachment export notify failed: HTTP ${res.status}`);
  }
}
