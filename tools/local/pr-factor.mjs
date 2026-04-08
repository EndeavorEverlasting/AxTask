#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectBaseRef, getSourceBranch } from "./pr-factor/git.mjs";
import { collectScan, ensureOutDir, writeJson } from "./pr-factor/collector.mjs";
import { classifyScan } from "./pr-factor/classifier.mjs";
import { planSlices } from "./pr-factor/planner.mjs";
import { buildTestAdvice } from "./pr-factor/advisor.mjs";
import { buildCommands, buildPlanMarkdown, writePartManifests, writeTextFile } from "./pr-factor/writer.mjs";

function nowStamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function parseArgs(argv) {
  const args = {
    command: "plan",
    baseRef: "",
    maxFiles: Number(process.env.PR_FILE_LIMIT || 200),
    outDir: path.join(".local", "pr-factor", nowStamp()),
    configPath: "",
    execute: false,
  };
  let i = 0;
  if (argv[0] && !argv[0].startsWith("-")) {
    args.command = argv[0];
    i = 1;
  }
  for (; i < argv.length; i += 1) {
    const token = argv[i];
    const value = argv[i + 1];
    if (token === "--base" && value) {
      args.baseRef = value; i += 1;
    } else if (token === "--max-files" && value) {
      args.maxFiles = Number(value); i += 1;
    } else if (token === "--out-dir" && value) {
      args.outDir = value; i += 1;
    } else if (token === "--config" && value) {
      args.configPath = value; i += 1;
    } else if (token === "--execute") {
      args.execute = true;
    }
  }
  return args;
}

function loadConfig(configPath) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const defaultPath = path.join(__dirname, "pr-factor", "config.default.json");
  const selectedPath = configPath || defaultPath;
  return JSON.parse(fs.readFileSync(selectedPath, "utf8"));
}

function usage() {
  console.log(
    [
      "Usage:",
      "  node tools/local/pr-factor.mjs <scan|classify|plan|apply> [--base <ref>] [--max-files <n>] [--out-dir <path>] [--config <json>]",
      "",
      "Examples:",
      "  node tools/local/pr-factor.mjs scan --base origin/main",
      "  node tools/local/pr-factor.mjs classify --base origin/main",
      "  node tools/local/pr-factor.mjs plan --base origin/main --max-files 200",
      "  node tools/local/pr-factor.mjs apply --out-dir .local/pr-factor/<timestamp>",
    ].join("\n"),
  );
}

function printSummary(outDir, scanData, classificationData, planData) {
  console.log(`[pr-factor] Out dir: ${outDir}`);
  console.log(`[pr-factor] Base ref: ${scanData.baseRef}`);
  console.log(`[pr-factor] Changed files: ${scanData.changedFileCount}`);
  if (classificationData) {
    const summary = Object.entries(classificationData.byBucket || {})
      .map(([bucket, count]) => `${bucket}:${count}`)
      .join(", ");
    console.log(`[pr-factor] Buckets: ${summary}`);
  }
  if (planData) console.log(`[pr-factor] Planned slices: ${planData.sliceCount}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveStageData(outDir, baseRef, config) {
  const scanPath = path.join(outDir, "scan.json");
  const classificationPath = path.join(outDir, "classification.json");
  const scanData = fs.existsSync(scanPath) ? readJson(scanPath) : collectScan(baseRef, config);
  const classificationData = fs.existsSync(classificationPath)
    ? readJson(classificationPath)
    : classifyScan(scanData, config);
  return { scanData, classificationData };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "--help" || args.command === "-h" || args.command === "help") {
    usage();
    return;
  }
  if (!Number.isFinite(args.maxFiles) || args.maxFiles <= 0) {
    console.error("[pr-factor] --max-files must be a positive number.");
    process.exit(1);
  }
  const config = loadConfig(args.configPath);
  const baseRef = detectBaseRef(args.baseRef);
  const sourceBranch = getSourceBranch();
  ensureOutDir(args.outDir);

  if (args.command === "scan") {
    const scanData = collectScan(baseRef, config);
    writeJson(args.outDir, "scan.json", scanData);
    printSummary(args.outDir, scanData);
    return;
  }

  if (args.command === "classify") {
    const { scanData } = resolveStageData(args.outDir, baseRef, config);
    const classificationData = classifyScan(scanData, config);
    writeJson(args.outDir, "scan.json", scanData);
    writeJson(args.outDir, "classification.json", classificationData);
    printSummary(args.outDir, scanData, classificationData);
    return;
  }

  if (args.command === "plan") {
    const { scanData, classificationData } = resolveStageData(args.outDir, baseRef, config);
    const planData = planSlices(classificationData, { maxFiles: args.maxFiles }, config);
    const adviceData = buildTestAdvice(planData.slices);
    writeJson(args.outDir, "scan.json", scanData);
    writeJson(args.outDir, "classification.json", classificationData);
    writeJson(args.outDir, "plan.json", planData);
    writeJson(args.outDir, "test-advice.json", adviceData);
    writePartManifests(args.outDir, planData);
    const commands = buildCommands({ outDir: args.outDir, sourceBranch, baseRef, slices: planData.slices });
    writeTextFile(path.join(args.outDir, "commands.sh"), commands.sh);
    writeTextFile(path.join(args.outDir, "commands.ps1"), commands.ps1);
    const markdown = buildPlanMarkdown({ scanData, classificationData, planData, adviceData });
    writeTextFile(path.join(args.outDir, "pr-plan.md"), markdown);
    printSummary(args.outDir, scanData, classificationData, planData);
    return;
  }

  if (args.command === "apply") {
    const shPath = path.join(args.outDir, "commands.sh");
    const ps1Path = path.join(args.outDir, "commands.ps1");
    if (!fs.existsSync(shPath) || !fs.existsSync(ps1Path)) {
      throw new Error(`[pr-factor] Missing commands files in ${args.outDir}. Run 'plan' first.`);
    }
    console.log("[pr-factor] Generated commands:");
    const commandFile = process.platform === "win32" ? ps1Path : shPath;
    console.log(fs.readFileSync(commandFile, "utf8"));
    if (args.execute) {
      console.log("[pr-factor] --execute not supported yet; run commands manually for safety.");
      process.exit(2);
    }
    return;
  }

  throw new Error(`[pr-factor] Unknown command '${args.command}'.`);
}

main();
