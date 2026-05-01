/**
 * Writes dist/deploy-manifest.json with deploy metadata that can be read at runtime
 * when git metadata is unavailable on PaaS hosts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const outPath = path.join(repoRoot, "dist", "deploy-manifest.json");

function firstNonEmpty(...values) {
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) return trimmed;
  }
  return null;
}

const manifest = {
  generatedAt: new Date().toISOString(),
  source: "build_time",
  buildId: firstNonEmpty(
    process.env.RENDER_BUILD_ID,
    process.env.CI_PIPELINE_ID,
    process.env.GITHUB_RUN_ID,
  ),
  commitSha: firstNonEmpty(
    process.env.RENDER_GIT_COMMIT,
    process.env.GITHUB_SHA,
    process.env.CI_COMMIT_SHA,
  ),
  branch: firstNonEmpty(
    process.env.RENDER_GIT_BRANCH,
    process.env.GITHUB_REF_NAME,
    process.env.CI_COMMIT_REF_NAME,
  ),
  provider: firstNonEmpty(
    process.env.RENDER ? "render" : "",
    process.env.GITHUB_ACTIONS ? "github_actions" : "",
    process.env.CI ? "ci" : "",
    "unknown",
  ),
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
console.log(`[deploy-manifest] wrote ${path.relative(repoRoot, outPath)}`);
