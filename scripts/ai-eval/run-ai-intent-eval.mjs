#!/usr/bin/env node
/**
 * Run AxTask AI intent eval pack (deterministic / fixture-backed).
 *
 * Usage:
 *   npx tsx scripts/ai-eval/run-ai-intent-eval.mjs
 *   npx tsx scripts/ai-eval/run-ai-intent-eval.mjs --output path/to/report.json
 *   npx tsx scripts/ai-eval/run-ai-intent-eval.mjs --write-baseline
 *   AXTASK_AI_EVAL_LIVE=1 npx tsx scripts/ai-eval/run-ai-intent-eval.mjs
 *
 * Exit codes:
 *   0 — gating threshold met and no baseline regressions
 *   1 — gating failure and/or baseline regression
 *   2 — pack missing / runner error
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { baselineFromReport, compareAiIntentBaseline } from "./compare-baseline.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv) {
  /** @type {{ output: string | null, writeBaseline: boolean, packRoot: string | null, skipCompare: boolean }} */
  const out = {
    output: null,
    writeBaseline: false,
    packRoot: null,
    skipCompare: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--output" && argv[i + 1]) out.output = argv[++i];
    else if (a.startsWith("--output=")) out.output = a.slice("--output=".length);
    else if (a === "--write-baseline") out.writeBaseline = true;
    else if (a === "--pack-root" && argv[i + 1]) out.packRoot = argv[++i];
    else if (a.startsWith("--pack-root=")) out.packRoot = a.slice("--pack-root=".length);
    else if (a === "--skip-compare") out.skipCompare = true;
  }
  return out;
}

async function loadRunPack() {
  const entry = path.join(repoRoot, "server", "ai-eval", "run-pack.ts");
  const entryUrl = pathToFileURL(entry).href;
  try {
    return await import(entryUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[ai-intent-eval] Could not import run-pack.ts (${msg}). Run via "npx tsx scripts/ai-eval/run-ai-intent-eval.mjs".`,
    );
  }
}

function defaultOutputPath() {
  return path.join(repoRoot, ".ai", "runs", "ai-intent-eval-local", "ai-intent-eval.json");
}

function resolveBaselinePath(packRoot) {
  return path.join(packRoot, "baselines", "v1", "latest.json");
}

function loadBaseline(baselinePath) {
  if (!fs.existsSync(baselinePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[ai-intent-eval] Failed to parse baseline ${baselinePath}: ${msg}`);
  }
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv);
  const { runAiIntentEvalPack, packExists, resolvePackRoot } = await loadRunPack();

  const packRoot = resolvePackRoot(repoRoot, args.packRoot ?? undefined);
  if (!packExists(packRoot, repoRoot)) {
    console.error(`[ai-intent-eval] Pack not found at ${packRoot} (expected manifest.v1.json).`);
    process.exit(2);
  }

  const report = await runAiIntentEvalPack({ repoRoot, packRoot });
  const outputPath = path.resolve(repoRoot, args.output ?? defaultOutputPath());
  ensureDir(outputPath);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");
  console.log(
    `[ai-intent-eval] Wrote report ${path.relative(repoRoot, outputPath)} ` +
      `(gating ${report.summary.gatingPassed}/${report.summary.gatingCases}, ` +
      `passRate=${report.summary.gatingPassRate.toFixed(3)}, skipped=${report.summary.skippedCases})`,
  );

  const baselinePath = resolveBaselinePath(packRoot);

  if (args.writeBaseline) {
    const baseline = baselineFromReport(report, {
      note: "written by scripts/ai-eval/run-ai-intent-eval.mjs --write-baseline",
    });
    // Attach threshold from manifest via report summary / pack
    const manifestPath = path.join(packRoot, "manifest.v1.json");
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      baseline.threshold = manifest.threshold;
    }
    ensureDir(baselinePath);
    fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2), "utf8");
    console.log(`[ai-intent-eval] Wrote baseline ${path.relative(repoRoot, baselinePath)}`);
  }

  let compareOk = true;
  if (!args.skipCompare) {
    const baseline = loadBaseline(baselinePath);
    const compare = compareAiIntentBaseline(
      baseline,
      {
        ...report,
        threshold: baseline?.threshold,
      },
      { allowEmptyBaseline: true },
    );
    compareOk = compare.ok;
    if (compare.notes.length) {
      for (const n of compare.notes) console.log(`[ai-intent-eval] note: ${n}`);
    }
    if (compare.improvements.length) {
      for (const i of compare.improvements) console.log(`[ai-intent-eval] improvement: ${i}`);
    }
    if (!compare.ok) {
      console.error("[ai-intent-eval] Baseline compare FAILED:");
      for (const r of compare.regressions) console.error(`  - regression: ${r}`);
      for (const t of compare.thresholdViolations) console.error(`  - threshold: ${t}`);
      for (const m of compare.missingFromCurrent) console.error(`  - missing: ${m}`);
      for (const f of compare.newGatingFailures) console.error(`  - gating failure: ${f}`);
    } else {
      console.log("[ai-intent-eval] Baseline compare OK");
    }
  }

  const gateOk = report.summary.thresholdMet === true;
  if (!gateOk) {
    console.error(
      `[ai-intent-eval] Gating threshold not met ` +
        `(failures=${report.summary.gatingFailures}, passRate=${report.summary.gatingPassRate})`,
    );
    for (const c of report.cases) {
      if (c.gating && !c.skipped && !c.pass) {
        const fails = c.criteria
          .filter((x) => x.layer === "correctness" && !x.pass)
          .map((x) => x.criterionId);
        console.error(`  - ${c.caseId}: ${fails.join(", ") || "no criteria"}`);
      }
    }
  }

  if (!gateOk || !compareOk) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[ai-intent-eval] fatal:", err);
  process.exit(2);
});
