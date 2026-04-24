#!/usr/bin/env npx tsx
/**
 * Break-glass attachment DR export (same manifest contract as GET /api/admin/attachments/export-bundle).
 *
 * Usage:
 *   npx tsx scripts/export-attachment-assets.ts --dry-run [--user-id=<id>] [--include-deleted]
 *   npx tsx scripts/export-attachment-assets.ts --out=./attachment-export.tar.gz [--user-id=<id>] [--include-deleted]
 *
 * Env: DATABASE_URL, ATTACHMENT_STORAGE_DIR (optional; defaults to ./storage/attachments)
 */
import "dotenv/config";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { buildDryRunAttachmentExport, createAttachmentExportTarGz } from "../server/services/attachment-export-core";

function argValue(flag: string): string | undefined {
  const hit = process.argv.find((a) => a === flag || a.startsWith(`${flag}=`));
  if (!hit) return undefined;
  if (hit.includes("=")) return hit.split("=").slice(1).join("=");
  const idx = process.argv.indexOf(hit);
  return process.argv[idx + 1];
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const includeDeleted = process.argv.includes("--include-deleted");
  const userId = argValue("--user-id");
  const missingOnly = process.argv.includes("--missing-only");
  const outPath = argValue("--out") || "attachment-export.tar.gz";

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  if (dryRun) {
    const body = await buildDryRunAttachmentExport({ userId, includeDeleted });
    const entries = missingOnly ? body.entries.filter((e) => !e.filePresent) : body.entries;
    console.log(JSON.stringify({ ...body, entries }, null, 2));
    process.exit(0);
  }

  const { stream, completion } = createAttachmentExportTarGz({ userId, includeDeleted });
  await pipeline(stream, createWriteStream(outPath));
  const info = await completion;
  console.error(
    JSON.stringify(
      {
        ok: true,
        outPath,
        manifestSha256: info.manifest.manifestSha256,
        exportRunId: info.exportRunId,
        assetCount: info.assetCount,
        bytesCopied: info.bytesCopied,
        missingFileCount: info.missingFileCount,
      },
      null,
      2,
    ),
  );
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
