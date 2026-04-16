/**
 * Orchestrates automated migration-related checks (no live server required for schema).
 * 1) Schema verify (needs DATABASE_URL)
 * 2) Reminds / runs unit tests (full feature regression in CI sense)
 *
 * Usage: node scripts/migration/run-migration-checks.mjs
 * Optional: SKIP_SCHEMA=1 to only print reminders
 * Optional: RUN_TESTS=1 to spawn npm test after schema verify
 */
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import "dotenv/config";

const verifyScript = fileURLToPath(new URL("./verify-schema.mjs", import.meta.url));

const skipSchema = process.env.SKIP_SCHEMA === "1";
const runTests = process.env.RUN_TESTS === "1";

function runNode(script) {
  const r = spawnSync(process.execPath, [script], {
    stdio: "inherit",
    cwd: process.cwd(),
    env: process.env,
  });
  return r.status ?? 1;
}

console.log("migration:run-migration-checks: starting\n");

if (!skipSchema) {
  if (!process.env.DATABASE_URL) {
    console.warn("migration:run-migration-checks: DATABASE_URL unset — skipping schema verify.");
    console.warn("  Set DATABASE_URL or SKIP_SCHEMA=1 to silence.\n");
  } else {
    const code = runNode(verifyScript);
    if (code !== 0) process.exit(code);
  }
}

console.log("migration:run-migration-checks: run full test suite: npm test");
console.log("migration:run-migration-checks: run build: npm run build");
console.log("migration:run-migration-checks: with server up: npm run migration:smoke-api\n");

if (runTests) {
  const t = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["test"],
    { stdio: "inherit", cwd: process.cwd(), shell: process.platform === "win32" },
  );
  process.exit(t.status ?? 1);
}

process.exit(0);
