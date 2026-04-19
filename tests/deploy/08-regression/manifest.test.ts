/**
 * Contract: build-manifest.mjs builds a well-formed manifest from a
 * fake dist tree. This isolates the manifest logic from an actual
 * `npm run build` so the suite runs fast and is safe to gate on.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildManifest } from "../../../scripts/deploy/build-manifest.mjs";

function writeFile(root: string, rel: string, content: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe("[08-regression] buildManifest", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "axtask-manifest-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("throws if dist/ does not exist", () => {
    expect(() => buildManifest(tmp)).toThrow(/dist/);
  });

  it("emits server entry info and hashes dist/index.js", () => {
    writeFile(tmp, "dist/index.js", "export {};");
    const manifest = buildManifest(tmp);
    expect(manifest.serverEntry.exists).toBe(true);
    expect(manifest.serverEntry.bytes).toBeGreaterThan(0);
    expect(manifest.serverEntry.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("groups client assets by extension and sorts by size desc", () => {
    writeFile(tmp, "dist/index.js", "server");
    writeFile(tmp, "dist/public/index.html", "<html></html>");
    writeFile(
      tmp,
      "dist/public/assets/react-vendor-abc123.js",
      "x".repeat(1000),
    );
    writeFile(tmp, "dist/public/assets/index-def456.js", "x".repeat(500));
    writeFile(tmp, "dist/public/assets/index-def456.css", "x".repeat(200));
    const manifest = buildManifest(tmp);
    expect(manifest.clientAssets).toHaveLength(3);
    expect(manifest.clientAssets[0].bytes).toBe(1000);
    expect(manifest.clientAssets[0].chunk).toBe("react-vendor");
    expect(manifest.clientAssets[1].chunk).toBe("index");
    expect(manifest.totals.js).toBe(1500);
    expect(manifest.totals.css).toBe(200);
  });

  it("produces a stable hash for identical server entries", () => {
    writeFile(tmp, "dist/index.js", "hello");
    const a = buildManifest(tmp);
    const b = buildManifest(tmp);
    expect(a.serverEntry.sha256).toBe(b.serverEntry.sha256);
  });
});
