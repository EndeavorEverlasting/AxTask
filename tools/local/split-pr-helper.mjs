#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_EXCLUDE_PATTERNS = [
  ".env.render",
  ".env.render.*",
  "*EnvFromRender.env",
  "NodeWeaver._pre_submodule_backup/**",
  "**/__pycache__/**",
  "**/*.pyc",
];

function parseArgs(argv) {
  const now = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const defaults = {
    baseRef: "",
    maxFiles: Number(process.env.PR_FILE_LIMIT || 300),
    parts: 0,
    outDir: path.join(".local", "pr-splits", now),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const value = argv[i + 1];
    if (token === "--base" && value) {
      defaults.baseRef = value;
      i += 1;
    } else if (token === "--max-files" && value) {
      defaults.maxFiles = Number(value);
      i += 1;
    } else if (token === "--parts" && value) {
      defaults.parts = Number(value);
      i += 1;
    } else if (token === "--out-dir" && value) {
      defaults.outDir = value;
      i += 1;
    }
  }
  return defaults;
}

function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if ((result.status ?? 1) !== 0) {
    const stderr = (result.stderr || "").trim();
    throw new Error(stderr || `git ${args.join(" ")} failed`);
  }
  return (result.stdout || "").trim();
}

function detectBaseRef(override) {
  if (override) return override;
  const candidates = ["origin/main", "origin/master", "main", "master"];
  for (const candidate of candidates) {
    const result = spawnSync("git", ["rev-parse", "--verify", candidate], { encoding: "utf8" });
    if ((result.status ?? 1) === 0) return candidate;
  }
  throw new Error(
    `[pr-split] Could not detect a valid base ref. Tried: ${candidates.join(", ")}. ` +
      "Specify one explicitly with --base <ref> (example: --base origin/main).",
  );
}

function changedFiles(baseRef) {
  const mergeBase = runGit(["merge-base", "HEAD", baseRef]);
  const raw = runGit(["diff", "--name-only", "--diff-filter=ACMR", `${mergeBase}...HEAD`]);
  const files = raw
    ? raw
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  return { mergeBase, files };
}

function globToRegExp(pattern) {
  const normalized = pattern.replace(/\\/g, "/");
  const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const withWildcards = escaped.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
  return new RegExp(`^${withWildcards}$`);
}

function shouldExclude(filePath, excludeRegexes) {
  const normalized = filePath.replace(/\\/g, "/");
  return excludeRegexes.some((rx) => rx.test(normalized));
}

function pickPartCount(total, preferred, maxFiles) {
  if (preferred > 0) return preferred;
  if (total <= maxFiles) return 1;
  return Math.max(2, Math.min(3, Math.ceil(total / maxFiles)));
}

function bucketName(file) {
  return file.includes("/") ? file.split("/")[0] : "(repo-root)";
}

function splitIntoParts(files, parts) {
  const grouped = new Map();
  for (const file of files) {
    const key = bucketName(file);
    const bucket = grouped.get(key) || [];
    bucket.push(file);
    grouped.set(key, bucket);
  }

  const groups = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length);
  const bins = Array.from({ length: parts }, () => ({ files: [], size: 0, buckets: new Set() }));

  for (const [key, groupFiles] of groups) {
    bins.sort((a, b) => a.size - b.size);
    const target = bins[0];
    target.files.push(...groupFiles);
    target.size += groupFiles.length;
    target.buckets.add(key);
  }
  return bins;
}

function writePartFiles(outDir, bins) {
  fs.mkdirSync(outDir, { recursive: true });
  for (let i = 0; i < bins.length; i += 1) {
    const part = bins[i];
    const manifest = path.join(outDir, `part-${i + 1}.txt`);
    const content = [...part.files].sort().join("\n");
    fs.writeFileSync(manifest, `${content}\n`, "utf8");
  }
}

function sanitizeBranchName(name) {
  return name.replace(/[^a-zA-Z0-9/_-]/g, "-").replace(/\/+/g, "/");
}

function printPlan({ sourceBranch, baseRef, outDir, bins }) {
  console.log(`[pr-split] Wrote ${bins.length} manifest file(s) to ${outDir}`);
  for (let i = 0; i < bins.length; i += 1) {
    const part = bins[i];
    const buckets = [...part.buckets].sort().join(", ");
    console.log(`[pr-split] part-${i + 1}: ${part.size} file(s) [${buckets}]`);
  }

  console.log("");
  console.log("Suggested branch commands:");
  const baseName = sanitizeBranchName(sourceBranch);
  for (let i = 0; i < bins.length; i += 1) {
    const idx = i + 1;
    const branchName = `${baseName}-part-${idx}`;
    const manifestPath = path.join(outDir, `part-${idx}.txt`).replace(/\\/g, "/");
    console.log(`# part ${idx}`);
    console.log(`git switch -c ${branchName} ${baseRef}`);
    console.log(`git restore --source ${sourceBranch} --staged --worktree --pathspec-from-file="${manifestPath}"`);
    console.log(`git commit -m "Split ${baseName} (part ${idx}/${bins.length})"`);
    console.log(`git push -u origin ${branchName}`);
    console.log("");
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!Number.isFinite(args.maxFiles) || args.maxFiles <= 0) {
    console.error("[pr-split] --max-files must be a positive number.");
    process.exit(1);
  }
  if (!Number.isFinite(args.parts) || args.parts < 0 || args.parts > 3) {
    console.error("[pr-split] --parts must be 0, 1, 2, or 3.");
    process.exit(1);
  }

  const sourceBranch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  const baseRef = detectBaseRef(args.baseRef);
  const { files } = changedFiles(baseRef);
  const excludeRegexes = DEFAULT_EXCLUDE_PATTERNS.map(globToRegExp);
  const filteredFiles = files.filter((file) => !shouldExclude(file, excludeRegexes));
  const excludedCount = files.length - filteredFiles.length;
  if (filteredFiles.length === 0) {
    console.log("[pr-split] No changed files detected.");
    return;
  }

  const parts = pickPartCount(filteredFiles.length, args.parts, args.maxFiles);
  const bins = splitIntoParts(filteredFiles, parts);
  writePartFiles(args.outDir, bins);

  console.log(`[pr-split] Source branch: ${sourceBranch}`);
  console.log(`[pr-split] Base ref: ${baseRef}`);
  console.log(`[pr-split] Changed files: ${filteredFiles.length}`);
  if (excludedCount > 0) {
    console.log(
      `[pr-split] Excluded ${excludedCount} file(s) using safety globs: ${DEFAULT_EXCLUDE_PATTERNS.join(", ")}`,
    );
  }
  if (parts === 1) {
    console.log("[pr-split] Branch is already within your threshold; manifest still generated for review.");
  }
  printPlan({ sourceBranch, baseRef, outDir: args.outDir, bins });
}

main();
