/**
 * Verifies that a production build produced every artifact the runtime
 * expects. Catches cases where a refactor removes a file or the build
 * silently fails to emit.
 *
 * Usage:  node scripts/deploy/check-artifacts.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

export const REQUIRED_BUILD_ARTIFACTS = [
  "dist/index.js",
  "dist/public/index.html",
];

export const REQUIRED_RUNTIME_FILES = [
  "migrations",
  "scripts/apply-migrations.mjs",
  "scripts/production-start.mjs",
  "drizzle.config.ts",
];

export function checkArtifacts(root = repoRoot) {
  const missing = [];
  for (const rel of REQUIRED_BUILD_ARTIFACTS) {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) missing.push({ kind: "build", path: rel });
  }
  for (const rel of REQUIRED_RUNTIME_FILES) {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) missing.push({ kind: "runtime", path: rel });
  }

  const assetsDir = path.join(root, "dist", "public", "assets");
  let jsCount = 0;
  if (fs.existsSync(assetsDir)) {
    jsCount = fs
      .readdirSync(assetsDir)
      .filter((f) => f.endsWith(".js")).length;
  } else {
    missing.push({ kind: "build", path: "dist/public/assets" });
  }
  if (jsCount === 0 && fs.existsSync(assetsDir)) {
    missing.push({ kind: "build", path: "dist/public/assets/*.js (none found)" });
  }

  return { ok: missing.length === 0, missing, jsChunkCount: jsCount };
}

function main() {
  const result = checkArtifacts();
  if (!result.ok) {
    console.error(
      `[artifacts] FAIL: ${result.missing.length} missing artifact(s)`,
    );
    for (const m of result.missing) {
      console.error(`  [${m.kind}] ${m.path}`);
    }
    process.exit(1);
  }
  console.log(
    `[artifacts] OK (${REQUIRED_BUILD_ARTIFACTS.length} build + ${REQUIRED_RUNTIME_FILES.length} runtime present, ${result.jsChunkCount} JS chunks)`,
  );
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
