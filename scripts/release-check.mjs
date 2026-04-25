#!/usr/bin/env node
/**
 * Lightweight release contract guardrail.
 *
 * Validates changed files in the current branch against baseline
 * (GITHUB_BASE_REF when available, else origin/main) and fails fast when
 * release-critical evidence is missing.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runGit(args, { allowFail = false } = {}) {
  const r = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.error) throw r.error;
  if (!allowFail && r.status !== 0) {
    throw new Error((r.stderr || r.stdout || `git ${args.join(" ")} failed`).trim());
  }
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function toSet(lines) {
  return new Set(
    lines
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean),
  );
}

function inferBaseBranch() {
  if (process.env.GITHUB_BASE_REF && process.env.GITHUB_BASE_REF.trim()) {
    return `origin/${process.env.GITHUB_BASE_REF.trim()}`;
  }
  return "origin/main";
}

function ensureFetched(ref) {
  const ok = runGit(["rev-parse", "--verify", "--quiet", ref], { allowFail: true });
  if (ok.status === 0) return;
  runGit(["fetch", "origin", ref.replace(/^origin\//, "")], { allowFail: true });
}

function changedFiles(baseRef) {
  ensureFetched(baseRef);
  const mergeBase = runGit(["merge-base", baseRef, "HEAD"], { allowFail: true });
  const range = mergeBase.status === 0 ? `${mergeBase.stdout.trim()}...HEAD` : `${baseRef}...HEAD`;
  const committed = runGit(["diff", "--name-only", range]).stdout;
  const staged = runGit(["diff", "--name-only", "--cached"]).stdout;
  const unstaged = runGit(["diff", "--name-only"]).stdout;
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"]).stdout;
  return { range, files: [...toSet(`${committed}\n${staged}\n${unstaged}\n${untracked}`)] };
}

function addedEnvKeysFromDiff(range) {
  const committed = runGit(["diff", "--unified=0", range]).stdout;
  const staged = runGit(["diff", "--unified=0", "--cached"]).stdout;
  const unstaged = runGit(["diff", "--unified=0"]).stdout;
  const diff = `${committed}\n${staged}\n${unstaged}`;
  const keys = new Set();
  for (const line of diff.split(/\r?\n/)) {
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    const m = line.match(/process\.env\.([A-Z][A-Z0-9_]+)/g);
    if (!m) continue;
    for (const hit of m) {
      const key = hit.split(".").pop();
      if (key) keys.add(key);
    }
  }
  return keys;
}

function envExampleKeys() {
  const src = readFileSync(path.join(root, ".env.example"), "utf8");
  const keys = new Set();
  for (const line of src.split(/\r?\n/)) {
    const m = line.match(/^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

function branchName() {
  return runGit(["branch", "--show-current"]).stdout.trim();
}

function hasReleaseDoc(files) {
  return files.some((f) => /^docs\/releases\/.+\.md$/i.test(f));
}

function main() {
  const baseRef = inferBaseBranch();
  const { range, files } = changedFiles(baseRef);
  const failures = [];
  const notices = [];

  const schemaTouched = files.some((f) => /^shared\/schema\/.+\.ts$/i.test(f));
  if (schemaTouched) {
    const hasSqlMigration = files.some((f) => /^migrations\/\d+_.+\.sql$/i.test(f));
    if (!hasSqlMigration) {
      failures.push(
        "Schema files changed under shared/schema but no numbered SQL migration was added under migrations/.",
      );
    }
  }

  const routeTouched = files.some((f) => /^server\/(routes|shopping-lists-routes)\.ts$/i.test(f));
  if (routeTouched && !files.includes("server/routes-inventory.contract.test.ts")) {
    failures.push(
      "Routes changed but server/routes-inventory.contract.test.ts was not updated (or snapshot not refreshed).",
    );
  }

  const addedEnvKeys = addedEnvKeysFromDiff(range);
  if (addedEnvKeys.size > 0) {
    const allowed = envExampleKeys();
    const missing = [...addedEnvKeys].filter((k) => !allowed.has(k));
    if (missing.length > 0 && !files.includes(".env.example")) {
      failures.push(
        `New process.env keys detected (${missing.join(", ")}) but .env.example was not updated.`,
      );
    } else if (missing.length > 0) {
      failures.push(
        `New process.env keys are missing from .env.example: ${missing.join(", ")}.`,
      );
    }
  }

  const branch = branchName();
  if (!/^main$|^master$/.test(branch)) {
    if (!hasReleaseDoc(files)) {
      failures.push("No docs/releases/*.md file changed on this feature branch.");
    } else {
      notices.push("Release document change detected.");
    }
  }

  console.log(`[release-check] base: ${baseRef}`);
  console.log(`[release-check] range: ${range}`);
  console.log(`[release-check] changed files: ${files.length}`);

  if (notices.length > 0) {
    for (const msg of notices) console.log(`[release-check] note: ${msg}`);
  }

  if (failures.length > 0) {
    for (const msg of failures) console.error(`[release-check] fail: ${msg}`);
    process.exit(1);
  }

  console.log("[release-check] ok");
}

main();
