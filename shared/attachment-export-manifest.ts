import { z } from "zod";
import { createHash } from "crypto";

/** Bump when manifest shape changes. */
export const ATTACHMENT_EXPORT_MANIFEST_VERSION = 1 as const;

const hex64 = z.string().regex(/^[a-f0-9]{64}$/);

export const attachmentExportEntrySchema = z.object({
  assetId: z.string().min(1),
  userId: z.string().min(1),
  archivePath: z.string().min(1),
  storageKey: z.string().min(1).nullable(),
  mimeType: z.string(),
  byteSize: z.number().int().nonnegative(),
  /** SHA-256 of file bytes when present; null if file missing on disk. */
  sha256: hex64.nullable(),
});

export type AttachmentExportEntry = z.infer<typeof attachmentExportEntrySchema>;

export const attachmentExportManifestBodySchema = z.object({
  schemaVersion: z.literal(ATTACHMENT_EXPORT_MANIFEST_VERSION),
  exportRunId: z.string().uuid(),
  exportedAt: z.string(),
  source: z.object({
    environment: z.string(),
  }),
  entries: z.array(attachmentExportEntrySchema),
});

export type AttachmentExportManifestBody = z.infer<typeof attachmentExportManifestBodySchema>;

export const attachmentExportManifestSchema = attachmentExportManifestBodySchema.extend({
  manifestSha256: hex64,
});

export type AttachmentExportManifest = z.infer<typeof attachmentExportManifestSchema>;

/** Deterministic JSON for hashing (sorted object keys, recursive). */
export function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function sha256HexOfUtf8(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function computeManifestSha256(body: AttachmentExportManifestBody): string {
  return sha256HexOfUtf8(stableStringify(body));
}

export function sealAttachmentExportManifest(body: AttachmentExportManifestBody): AttachmentExportManifest {
  const manifestSha256 = computeManifestSha256(body);
  return attachmentExportManifestSchema.parse({ ...body, manifestSha256 });
}
