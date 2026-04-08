import fs from "node:fs";
import path from "node:path";

export function writePartManifests(outDir, planData) {
  const files = [];
  for (const slice of planData.slices) {
    const filePath = path.join(outDir, `${slice.id}.txt`);
    fs.writeFileSync(filePath, `${slice.files.join("\n")}\n`, "utf8");
    files.push(filePath);
  }
  return files;
}

function sanitizeBranchName(name) {
  return name.replace(/[^a-zA-Z0-9/_-]/g, "-").replace(/\/+/g, "/");
}

export function buildCommands({ outDir, sourceBranch, baseRef, slices }) {
  const baseName = sanitizeBranchName(sourceBranch);
  const linesSh = ["#!/usr/bin/env bash", "set -euo pipefail", ""];
  const linesPs = ["$ErrorActionPreference = 'Stop'", ""];

  for (const slice of slices) {
    const branchName = `${baseName}-${slice.id}`;
    const manifestPath = path.join(outDir, `${slice.id}.txt`).replace(/\\/g, "/");
    linesSh.push(`# ${slice.id}: ${slice.title}`);
    linesSh.push(`git switch -c "${branchName}" "${baseRef}"`);
    linesSh.push(`git restore --source "${sourceBranch}" --staged --worktree --pathspec-from-file="${manifestPath}"`);
    linesSh.push(`git commit -m "Split ${baseName} (${slice.id})"`);
    linesSh.push(`git push -u origin "${branchName}"`);
    linesSh.push("");

    linesPs.push(`# ${slice.id}: ${slice.title}`);
    linesPs.push(`git switch -c "${branchName}" "${baseRef}"`);
    linesPs.push(`git restore --source "${sourceBranch}" --staged --worktree --pathspec-from-file="${manifestPath}"`);
    linesPs.push(`git commit -m "Split ${baseName} (${slice.id})"`);
    linesPs.push(`git push -u origin "${branchName}"`);
    linesPs.push("");
  }
  return { sh: `${linesSh.join("\n")}\n`, ps1: `${linesPs.join("\n")}\n` };
}

export function writeTextFile(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

export function buildPlanMarkdown({ scanData, classificationData, planData, adviceData }) {
  const lines = [];
  lines.push("# PR Factor Plan");
  lines.push("");
  lines.push(`- Base ref: \`${scanData.baseRef}\``);
  lines.push(`- Changed files: \`${scanData.changedFileCount}\``);
  lines.push(`- Planned slices: \`${planData.sliceCount}\``);
  lines.push("");
  lines.push("## Bucket Summary");
  for (const [bucket, count] of Object.entries(classificationData.byBucket || {})) {
    lines.push(`- ${bucket}: ${count}`);
  }
  lines.push("");
  lines.push("## Slices");
  for (const slice of planData.slices) {
    lines.push(`### ${slice.id} - ${slice.title}`);
    lines.push(`- Buckets: ${slice.buckets.join(", ")}`);
    lines.push(`- File count: ${slice.count}`);
    lines.push(`- Manifest: \`${slice.id}.txt\``);
    const advice = adviceData.find((a) => a.id === slice.id);
    if (advice) {
      lines.push("- Suggested checks:");
      for (const check of advice.checks) lines.push(`  - ${check}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
