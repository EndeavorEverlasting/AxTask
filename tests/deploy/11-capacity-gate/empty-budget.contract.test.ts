import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const source = fs.readFileSync(
  path.join(repoRoot, "scripts", "deploy", "check-db-capacity.mjs"),
  "utf8",
);

describe("[11-capacity-gate] explicit empty budget", () => {
  it("distinguishes an absent variable from an explicitly empty one", () => {
    expect(source).toContain(
      "Object.prototype.hasOwnProperty.call(process.env, key)",
    );
    expect(source).toContain(
      "if (!Object.prototype.hasOwnProperty.call(process.env, key)) return null",
    );
    expect(source).toContain('String(raw).trim() === ""');
    expect(source).toContain("is explicitly configured but empty");
  });
});
