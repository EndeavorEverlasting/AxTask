import { randomUUID, createHash } from "crypto";
import { createGzip } from "zlib";
import type { Readable } from "stream";
import { pack } from "tar-stream";
import type { AttachmentAsset } from "@shared/schema";
import {
  ATTACHMENT_EXPORT_MANIFEST_VERSION,
  stableStringify,
  sealAttachmentExportManifest,
  type AttachmentExportEntry,
  type AttachmentExportManifest,
  type AttachmentExportManifestBody,
} from "@shared/attachment-export-manifest";
import { adminListAttachmentAssetsForExport } from "../storage";
import { readAttachmentObject, attachmentObjectExists } from "./attachment-storage";

export function resolveAttachmentStorageKey(
  asset: Pick<AttachmentAsset, "storageKey" | "metadataJson">,
): string | null {
  if (asset.storageKey) return asset.storageKey;
  if (!asset.metadataJson) return null;
  try {
    const meta = JSON.parse(asset.metadataJson) as { storageKey?: string };
    return typeof meta.storageKey === "string" ? meta.storageKey : null;
  } catch {
    return null;
  }
}

export type AttachmentExportQuery = {
  userId?: string;
  includeDeleted?: boolean;
};

function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function packEntryBuffer(tar: ReturnType<typeof pack>, name: string, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    tar.entry({ name, mtime: new Date(), size: data.byteLength }, data, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function loadAttachmentAssetsForExport(query: AttachmentExportQuery): Promise<AttachmentAsset[]> {
  return adminListAttachmentAssetsForExport({
    userId: query.userId,
    includeDeleted: query.includeDeleted,
    limit: 200_000,
  });
}

export async function buildDryRunAttachmentExport(query: AttachmentExportQuery): Promise<{
  exportRunId: string;
  exportedAt: string;
  assetCount: number;
  missingFileCount: number;
  entries: Array<{
    assetId: string;
    userId: string;
    archivePath: string;
    storageKey: string | null;
    mimeType: string;
    byteSize: number;
    filePresent: boolean;
  }>;
}> {
  const assets = await loadAttachmentAssetsForExport(query);
  const exportRunId = randomUUID();
  const exportedAt = new Date().toISOString();
  let missingFileCount = 0;
  const entries: Array<{
    assetId: string;
    userId: string;
    archivePath: string;
    storageKey: string | null;
    mimeType: string;
    byteSize: number;
    filePresent: boolean;
  }> = [];
  for (const asset of assets) {
    const sk = resolveAttachmentStorageKey(asset);
    const filePresent = sk ? await attachmentObjectExists(sk) : false;
    if (!filePresent) missingFileCount += 1;
    entries.push({
      assetId: asset.id,
      userId: asset.userId,
      archivePath: `files/${asset.id}`,
      storageKey: sk,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      filePresent,
    });
  }
  return { exportRunId, exportedAt, assetCount: assets.length, missingFileCount, entries };
}

export type AttachmentExportTarResult = {
  stream: Readable;
  /** Resolves when the tarball is fully finalized (or rejects on error). */
  completion: Promise<{
    manifest: AttachmentExportManifest;
    exportRunId: string;
    assetCount: number;
    bytesCopied: number;
    missingFileCount: number;
  }>;
};

/**
 * Streams a gzip-compressed tar containing `files/<assetId>` blobs and a final `manifest.json`.
 */
export function createAttachmentExportTarGz(query: AttachmentExportQuery): AttachmentExportTarResult {
  const tar = pack();
  const gzip = createGzip();
  tar.pipe(gzip);

  const completion = (async () => {
    const assets = await loadAttachmentAssetsForExport(query);
    const exportRunId = randomUUID();
    const exportedAt = new Date().toISOString();
    const entries: AttachmentExportEntry[] = [];
    let bytesCopied = 0;
    let missingFileCount = 0;

    try {
      for (const asset of assets) {
        const storageKey = resolveAttachmentStorageKey(asset);
        const archivePath = `files/${asset.id}`;
        if (!storageKey) {
          missingFileCount += 1;
          entries.push({
            assetId: asset.id,
            userId: asset.userId,
            archivePath,
            storageKey: null,
            mimeType: asset.mimeType,
            byteSize: asset.byteSize,
            sha256: null,
          });
          continue;
        }
        const bytes = await readAttachmentObject(storageKey);
        if (!bytes) {
          missingFileCount += 1;
          entries.push({
            assetId: asset.id,
            userId: asset.userId,
            archivePath,
            storageKey,
            mimeType: asset.mimeType,
            byteSize: asset.byteSize,
            sha256: null,
          });
          continue;
        }
        const sha256 = sha256Buffer(bytes);
        bytesCopied += bytes.length;
        await packEntryBuffer(tar, archivePath, bytes);
        entries.push({
          assetId: asset.id,
          userId: asset.userId,
          archivePath,
          storageKey,
          mimeType: asset.mimeType,
          byteSize: asset.byteSize,
          sha256,
        });
      }

      const body: AttachmentExportManifestBody = {
        schemaVersion: ATTACHMENT_EXPORT_MANIFEST_VERSION,
        exportRunId,
        exportedAt,
        source: {
          environment:
            process.env.REPL_SLUG || process.env.REPLIT_DEV_DOMAIN || process.env.NODE_ENV || "unknown",
        },
        entries,
      };
      const manifest = sealAttachmentExportManifest(body);
      const manifestBytes = Buffer.from(stableStringify(manifest), "utf8");
      await packEntryBuffer(tar, "manifest.json", manifestBytes);
      tar.finalize();

      return {
        manifest,
        exportRunId,
        assetCount: assets.length,
        bytesCopied,
        missingFileCount,
      };
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      tar.destroy(err);
      gzip.destroy(err);
      throw err;
    }
  })();

  return { stream: gzip, completion };
}
