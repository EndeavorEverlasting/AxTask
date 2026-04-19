#!/usr/bin/env node
/**
 * Local smoke test for the schemaVersion-1 backup import path.
 *
 * Usage:
 *   node scripts/smoke-v1-backup-zip.mjs              # auto-scan docs/ for *.json
 *   node scripts/smoke-v1-backup-zip.mjs <path.json>  # validate one file
 *   node scripts/smoke-v1-backup-zip.mjs <dir>        # validate every *.json in dir
 *
 * Exits 0 with a "skip" message if no candidate JSON files are found (so the
 * script is safe to run in pre-commit hooks or CI). Exits non-zero if any task
 * row in any file fails to parse via insertTaskSchema after normalization.
 *
 * The original zip (`docs/json imports of rich perez account.zip`) is
 * gitignored; extract it once locally and point the script at a JSON inside.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function tsxBinary() {
  const local = join(repoRoot, "node_modules", ".bin", "tsx");
  if (process.platform === "win32" && existsSync(local + ".cmd")) return local + ".cmd";
  if (existsSync(local)) return local;
  return "tsx";
}

function findCandidates(arg) {
  if (arg) {
    const abs = resolve(repoRoot, arg);
    if (!existsSync(abs)) {
      console.error(`[smoke-v1] no such path: ${abs}`);
      process.exit(1);
    }
    const s = statSync(abs);
    if (s.isDirectory()) {
      return readdirSync(abs)
        .filter((f) => f.toLowerCase().endsWith(".json"))
        .map((f) => join(abs, f));
    }
    return [abs];
  }
  const docsDir = join(repoRoot, "docs");
  if (!existsSync(docsDir)) return [];
  const candidates = [];
  for (const f of readdirSync(docsDir)) {
    if (!f.toLowerCase().endsWith(".json")) continue;
    if (!f.toLowerCase().includes("backup") && !f.toLowerCase().includes("axtask") && !f.toLowerCase().includes("import")) continue;
    candidates.push(join(docsDir, f));
  }
  return candidates;
}

function main() {
  const arg = process.argv[2];
  const candidates = findCandidates(arg);

  if (candidates.length === 0) {
    console.log("[smoke-v1] skip: no candidate JSON files found.");
    console.log("[smoke-v1]   Drop an extracted v1 backup JSON into docs/ (or pass a path),");
    console.log("[smoke-v1]   e.g. unzip 'docs/json imports of rich perez account.zip' into docs/.");
    process.exit(0);
  }

  console.log(`[smoke-v1] validating ${candidates.length} file(s) against current insertTaskSchema:`);

  // Defer the actual validation to a tsx-run TS file so we can import the
  // real server/account-backup helpers (normalizeV1TaskRow, planAccountImport)
  // without duplicating logic in JS.
  const runner = join(__dirname, "smoke-v1-backup-zip.runner.ts");
  let allOk = true;
  let totalTasks = 0;
  let totalRejected = 0;

  for (const file of candidates) {
    const tsx = tsxBinary();
    const result = spawnSync(tsx, [runner, file], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      // Windows .cmd shims must run through a shell
      shell: process.platform === "win32" && tsx.endsWith(".cmd"),
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL && process.env.DATABASE_URL.length > 0
            ? process.env.DATABASE_URL
            : "postgresql://smoke:smoke@127.0.0.1:5432/smoke",
      },
    });
    const out = (result.stdout || "").trim();
    const err = (result.stderr || "").trim();
    if (result.status !== 0) {
      console.error(`[smoke-v1] FAIL ${basename(file)}`);
      if (out) console.error(out);
      if (err) console.error(err);
      allOk = false;
      continue;
    }
    try {
      const parsed = JSON.parse(out);
      const label = parsed.ok ? "ok  " : "FAIL";
      console.log(
        `[smoke-v1] ${label} ${basename(file)}: ${parsed.tasks} tasks valid, ${parsed.rejected} rejected (schemaVersion=${parsed.schemaVersion})`,
      );
      if (!parsed.ok) {
        allOk = false;
        for (const e of parsed.errors.slice(0, 5)) {
          console.log(`[smoke-v1]      - task[${e.field}]: ${e.message}`);
        }
      }
      totalTasks += parsed.tasks;
      totalRejected += parsed.rejected;
    } catch {
      console.error(`[smoke-v1] FAIL ${basename(file)}: could not parse runner output`);
      console.error(out);
      allOk = false;
    }
  }

  console.log(`[smoke-v1] totals: ${totalTasks} valid, ${totalRejected} rejected across ${candidates.length} file(s).`);
  process.exit(allOk ? 0 : 1);
}

main();
