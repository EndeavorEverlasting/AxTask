import { describe, it, expect } from "vitest";
import {
  ATTACHMENT_EXPORT_MANIFEST_VERSION,
  computeManifestSha256,
  sealAttachmentExportManifest,
  stableStringify,
} from "./attachment-export-manifest";

describe("attachment-export-manifest", () => {
  it("stableStringify is deterministic for nested objects", () => {
    const a = stableStringify({ b: 2, a: 1, c: { z: 1, y: 2 } });
    const b = stableStringify({ c: { y: 2, z: 1 }, a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it("sealAttachmentExportManifest matches computeManifestSha256 on body", () => {
    const body = {
      schemaVersion: ATTACHMENT_EXPORT_MANIFEST_VERSION,
      exportRunId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      exportedAt: "2026-01-01T00:00:00.000Z",
      source: { environment: "test" },
      entries: [
        {
          assetId: "asset-1",
          userId: "user-1",
          archivePath: "files/asset-1",
          storageKey: "k1",
          mimeType: "image/png",
          byteSize: 10,
          sha256: "a".repeat(64),
        },
      ],
    };
    const expected = computeManifestSha256(body);
    const sealed = sealAttachmentExportManifest(body);
    expect(sealed.manifestSha256).toBe(expected);
  });
});
