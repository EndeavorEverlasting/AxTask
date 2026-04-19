/**
 * Contract: check-artifacts validates build/runtime file presence.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkArtifacts,
  REQUIRED_BUILD_ARTIFACTS,
  REQUIRED_RUNTIME_FILES,
} from "../../../scripts/deploy/check-artifacts.mjs";

function scaffold(root: string, files: string[]) {
  for (const rel of files) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, "// stub");
  }
}

describe("[03-artifacts] checkArtifacts", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "axtask-artifacts-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("flags missing build artifacts", () => {
    scaffold(tmp, REQUIRED_RUNTIME_FILES.map((p) =>
      p.endsWith(".ts") || p.endsWith(".mjs") ? p : path.join(p, ".keep"),
    ));
    const result = checkArtifacts(tmp);
    expect(result.ok).toBe(false);
    expect(result.missing.some((m) => m.path.includes("dist/index.js"))).toBe(true);
  });

  it("flags missing runtime files", () => {
    scaffold(tmp, [
      ...REQUIRED_BUILD_ARTIFACTS,
      "dist/public/assets/index-abc.js",
    ]);
    const result = checkArtifacts(tmp);
    expect(result.ok).toBe(false);
    expect(
      result.missing.some((m) => m.path.includes("apply-migrations.mjs")),
    ).toBe(true);
  });

  it("passes when all required artifacts and runtime files exist", () => {
    scaffold(tmp, [
      ...REQUIRED_BUILD_ARTIFACTS,
      "dist/public/assets/index-abc.js",
      "scripts/apply-migrations.mjs",
      "scripts/production-start.mjs",
      "drizzle.config.ts",
      "migrations/0001_initial.sql",
    ]);
    const result = checkArtifacts(tmp);
    expect(result.ok).toBe(true);
    expect(result.jsChunkCount).toBe(1);
  });

  it("flags empty assets directory", () => {
    scaffold(tmp, [
      ...REQUIRED_BUILD_ARTIFACTS,
      "scripts/apply-migrations.mjs",
      "scripts/production-start.mjs",
      "drizzle.config.ts",
      "migrations/0001_initial.sql",
    ]);
    fs.mkdirSync(path.join(tmp, "dist/public/assets"), { recursive: true });
    const result = checkArtifacts(tmp);
    expect(result.ok).toBe(false);
    expect(
      result.missing.some((m) => /assets.*js.*none found/i.test(m.path)),
    ).toBe(true);
  });
});
