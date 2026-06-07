// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  generateHexSecret,
  hexLengthFromOptions,
  parseArgs,
} from "./generate-secret-core.mjs";

const root = path.resolve(__dirname, "..");
const scriptSrc = fs.readFileSync(path.join(root, "scripts", "generate-secret.mjs"), "utf8");
const coreSrc = fs.readFileSync(path.join(root, "scripts", "generate-secret-core.mjs"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const HEX_RE = /^[0-9a-f]+$/;

describe("generate-secret", () => {
  it("default output is 64 lowercase hex characters", () => {
    const token = generateHexSecret();
    expect(token).toHaveLength(64);
    expect(token).toMatch(HEX_RE);
  });

  it("--chars 32 gives 32 hex characters", () => {
    const token = generateHexSecret({ chars: 32 });
    expect(token).toHaveLength(32);
    expect(token).toMatch(HEX_RE);
  });

  it("--bits 64 gives 16 hex characters", () => {
    expect(hexLengthFromOptions({ bits: 64 })).toBe(16);
    const token = generateHexSecret({ bits: 64 });
    expect(token).toHaveLength(16);
    expect(token).toMatch(HEX_RE);
  });

  it("rejects odd --chars", () => {
    expect(() => hexLengthFromOptions({ chars: 31 })).toThrow(/even/);
  });

  it("rejects bit counts not divisible by 8", () => {
    expect(() => hexLengthFromOptions({ bits: 65 })).toThrow(/divisible by 8/);
  });

  it("rejects --chars and --bits together", () => {
    expect(() => hexLengthFromOptions({ chars: 32, bits: 256 })).toThrow(/only one/);
    expect(() => parseArgs(["--chars", "32", "--bits", "256"])).toThrow();
  });

  it("parseArgs rejects invalid numeric input", () => {
    expect(() => parseArgs(["--chars", "nope"])).toThrow();
    expect(() => parseArgs(["--bits", "0"])).toThrow(/greater than zero/);
    expect(() => parseArgs(["--bits", "-8"])).toThrow();
  });

  it("package.json exposes secret:hex and secret:token scripts", () => {
    expect(pkg.scripts["secret:hex"]).toBe("node scripts/generate-secret.mjs");
    expect(pkg.scripts["secret:token"]).toBe("node scripts/generate-secret.mjs");
  });

  it("script uses randomBytes and does not write secrets to disk", () => {
    expect(coreSrc).toMatch(/randomBytes/);
    expect(scriptSrc).not.toMatch(/fs\.(write|append)File(Sync)?\s*\(/);
    expect(coreSrc).not.toMatch(/fs\.(write|append)File(Sync)?\s*\(/);
  });
});
