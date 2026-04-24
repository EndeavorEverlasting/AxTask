import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "stream";
import { extract } from "tar-stream";
import { createGunzip } from "zlib";
import { pipeline } from "stream/promises";
import type { AttachmentAsset } from "@shared/schema";
import { stableStringify } from "@shared/attachment-export-manifest";
import { createAttachmentExportTarGz, resolveAttachmentStorageKey } from "./services/attachment-export-core";

vi.mock("./storage", () => ({
  adminListAttachmentAssetsForExport: vi.fn(),
}));

vi.mock("./services/attachment-storage", () => ({
  readAttachmentObject: vi.fn(),
  attachmentObjectExists: vi.fn(),
}));

import { adminListAttachmentAssetsForExport } from "./storage";
import { readAttachmentObject } from "./services/attachment-storage";

async function collectTarEntries(stream: Readable): Promise<{ name: string; data: Buffer }[]> {
  const out: { name: string; data: Buffer }[] = [];
  const gunzip = createGunzip();
  const parser = extract();
  parser.on("entry", (header, entryStream, next) => {
    const chunks: Buffer[] = [];
    entryStream.on("data", (c: Buffer) => chunks.push(c));
    entryStream.on("end", () => {
      out.push({ name: header.name, data: Buffer.concat(chunks) });
      next();
    });
    entryStream.resume();
  });
  await pipeline(stream, gunzip, parser);
  return out;
}

describe("attachment-export-core", () => {
  beforeEach(() => {
    vi.mocked(adminListAttachmentAssetsForExport).mockReset();
    vi.mocked(readAttachmentObject).mockReset();
  });

  it("resolveAttachmentStorageKey prefers column then metadata", () => {
    expect(
      resolveAttachmentStorageKey({
        storageKey: "col-key",
        metadataJson: JSON.stringify({ storageKey: "meta-key" }),
      }),
    ).toBe("col-key");
    expect(
      resolveAttachmentStorageKey({
        storageKey: null,
        metadataJson: JSON.stringify({ storageKey: "meta-key" }),
      }),
    ).toBe("meta-key");
    expect(resolveAttachmentStorageKey({ storageKey: null, metadataJson: null })).toBeNull();
  });

  it("createAttachmentExportTarGz writes manifest and file bytes", async () => {
    const asset: AttachmentAsset = {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      userId: "user-1",
      taskId: null,
      kind: "feedback",
      fileName: "x.png",
      mimeType: "image/png",
      byteSize: 3,
      storageKey: null,
      metadataJson: JSON.stringify({ storageKey: "u/2026-01-01/x.png" }),
      createdAt: new Date(),
      deletedAt: null,
    };
    vi.mocked(adminListAttachmentAssetsForExport).mockResolvedValue([asset]);
    vi.mocked(readAttachmentObject).mockResolvedValue(Buffer.from("abc"));

    const { stream, completion } = createAttachmentExportTarGz({});
    const entries = await collectTarEntries(stream);
    const info = await completion;

    const manifestEntry = entries.find((e) => e.name === "manifest.json");
    const fileEntry = entries.find((e) => e.name === `files/${asset.id}`);
    expect(fileEntry?.data.toString()).toBe("abc");
    expect(manifestEntry).toBeTruthy();
    const manifest = JSON.parse(manifestEntry!.data.toString("utf8")) as { manifestSha256: string };
    expect(manifest.manifestSha256).toBe(info.manifest.manifestSha256);
    expect(stableStringify(manifest)).toBe(manifestEntry!.data.toString("utf8"));
  });
});
