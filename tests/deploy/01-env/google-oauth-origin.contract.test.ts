// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const renderYaml = fs.readFileSync(path.join(repoRoot, "render.yaml"), "utf8");

describe("[01-env] Google OAuth canonical origin", () => {
  it("pins Render login and callback to axtask.app", () => {
    expect(renderYaml).toContain("- key: CANONICAL_HOST\n        value: axtask.app");
    expect(renderYaml).toContain(
      "- key: GOOGLE_REDIRECT_URI\n        value: https://axtask.app/api/auth/google/callback",
    );
  });

  it("does not allow the legacy axtask.dev apex to bypass the canonical redirect", () => {
    expect(renderYaml).toContain("- key: ADDITIONAL_ALLOWED_HOSTS\n        value: www.axtask.app");
    expect(renderYaml).not.toMatch(/value:\s*[^\n]*axtask\.dev/i);
  });
});
