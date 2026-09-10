import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { interpretIntent, LlmProviderConfigError } from "../ai/orchestration/ai-orchestrator";
import type { AiIntentResult } from "../ai/schemas/intent-result";
import { buildFixtureProvider } from "./fixture-provider";
import {
  allGatingCriteriaPassed,
  executeProbe,
  scoreDiagnosis,
  scoreIntentAgainstExpect,
  scoreStyleCriteria,
} from "./scorers";
import type {
  AiIntentEvalCase,
  AiIntentEvalManifest,
  AiIntentEvalReport,
  CaseEvalResult,
  CaseRunOutcome,
  CriterionResult,
} from "./types";

/** Keep criteria listed in rubricCriteria plus always-on diagnosis/outcome when present. */
function filterToRubric(criteria: CriterionResult[], rubricCriteria: string[] | undefined): CriterionResult[] {
  if (!rubricCriteria || rubricCriteria.length === 0) return criteria;
  const keep = new Set(rubricCriteria);
  return criteria.filter((row) => keep.has(row.criterionId));
}

const DEFAULT_PACK_REL = path.join("evals", "ai-intent");

export function resolveRepoRoot(fromDir = path.dirname(fileURLToPath(import.meta.url))): string {
  // server/ai-eval → repo root
  return path.resolve(fromDir, "..", "..");
}

export function resolvePackRoot(repoRoot?: string, packRoot?: string): string {
  if (packRoot) return path.resolve(packRoot);
  return path.join(repoRoot ?? resolveRepoRoot(), DEFAULT_PACK_REL);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function expandCasesGlob(packRoot: string, casesGlob: string): string[] {
  // Manifest uses patterns like "cases/v1/*.json" — expand with readdir.
  const normalized = casesGlob.replace(/\\/g, "/");
  const star = normalized.lastIndexOf("*");
  if (star === -1) {
    const abs = path.join(packRoot, normalized);
    return fs.existsSync(abs) ? [abs] : [];
  }
  const dirPart = normalized.slice(0, normalized.lastIndexOf("/"));
  const filePat = normalized.slice(normalized.lastIndexOf("/") + 1);
  const dirAbs = path.join(packRoot, dirPart);
  if (!fs.existsSync(dirAbs)) return [];
  const suffix = filePat.startsWith("*.") ? filePat.slice(1) : ".json";
  return fs
    .readdirSync(dirAbs)
    .filter((name) => name.endsWith(suffix) && name.endsWith(".json"))
    .map((name) => path.join(dirAbs, name))
    .sort();
}

function loadCasesFromFile(filePath: string): AiIntentEvalCase[] {
  const raw = readJson<AiIntentEvalCase | AiIntentEvalCase[]>(filePath);
  return Array.isArray(raw) ? raw : [raw];
}

export function loadAiIntentPack(packRoot: string): {
  manifest: AiIntentEvalManifest;
  cases: AiIntentEvalCase[];
} {
  const manifestPath = path.join(packRoot, "manifest.v1.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`AI intent eval pack missing manifest at ${manifestPath}`);
  }
  const manifest = readJson<AiIntentEvalManifest>(manifestPath);
  const files = expandCasesGlob(packRoot, manifest.casesGlob || "cases/v1/*.json");
  const cases: AiIntentEvalCase[] = [];
  for (const file of files) {
    cases.push(...loadCasesFromFile(file));
  }

  // Prefer manifest order when caseIds listed; append any extras.
  if (Array.isArray(manifest.caseIds) && manifest.caseIds.length > 0) {
    const byId = new Map(cases.map((c) => [c.id, c]));
    const ordered: AiIntentEvalCase[] = [];
    for (const id of manifest.caseIds) {
      const c = byId.get(id);
      if (c) {
        ordered.push(c);
        byId.delete(id);
      }
    }
    for (const c of byId.values()) ordered.push(c);
    return { manifest, cases: ordered };
  }

  return { manifest, cases };
}

function isDiagnosisOnly(c: AiIntentEvalCase): boolean {
  return c.mode === "score_stub_diagnosis" || c.expectDiagnosisOnly === true;
}

function stubIntent(c: AiIntentEvalCase): AiIntentResult | null {
  if (c.llmStub && "intent" in c.llmStub) return c.llmStub.intent;
  return null;
}

async function runInterpretCase(c: AiIntentEvalCase): Promise<CaseRunOutcome> {
  const provider = buildFixtureProvider(c.llmStub);

  // For config_error with no stub, ensure we do not accidentally hit a live key path.
  const prevKey = process.env.OPENAI_API_KEY;
  const clearKey = c.expect.outcome === "config_error" && c.llmStub == null;
  if (clearKey) {
    delete process.env.OPENAI_API_KEY;
  }

  try {
    const out = await interpretIntent(c.input.message, provider);
    return {
      kind: "intent",
      intent: out.intent,
      provider: out.provider,
      model: out.model,
      latencyMs: out.latencyMs,
    };
  } catch (err) {
    const errorName = err instanceof Error ? err.name : "Error";
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof LlmProviderConfigError || errorName === "LlmProviderConfigError") {
      return { kind: "config_error", errorName, message };
    }
    return { kind: "provider_error", errorName, message };
  } finally {
    if (clearKey) {
      if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevKey;
    }
  }
}

function scoreCase(
  c: AiIntentEvalCase,
  run: CaseRunOutcome,
  diagnosisOnly: boolean,
): { criteria: CriterionResult[]; executeProbeResult: ReturnType<typeof executeProbe> | null } {
  const intent: AiIntentResult | null =
    diagnosisOnly && stubIntent(c) ? stubIntent(c) : run.kind === "intent" ? run.intent : null;
  const outcome = diagnosisOnly && stubIntent(c) ? "intent" : run.kind;
  const provider =
    diagnosisOnly && stubIntent(c)
      ? "fixture"
      : run.kind === "intent"
        ? run.provider
        : null;

  let criteria: CriterionResult[] = [
    ...scoreIntentAgainstExpect(c.id, intent, c.expect, {
      provider,
      outcome,
      diagnosisOnly,
      diagnosis: c.diagnosis,
      context: c.context,
    }),
    ...scoreDiagnosis(c.id, intent, c.diagnosis, c.expect, {
      context: c.context,
      diagnosisOnly,
      outcome: run.kind,
    }),
    ...scoreStyleCriteria(c.id, intent, c.rubricCriteria),
  ];

  let executeProbeResult: ReturnType<typeof executeProbe> | null = null;
  if (c.expect.execute != null && intent) {
    executeProbeResult = executeProbe(intent, c.context);
    const pass =
      executeProbeResult.ok === c.expect.execute.ok &&
      (c.expect.execute.reason == null || executeProbeResult.reason === c.expect.execute.reason);
    criteria.push({
      caseId: c.id,
      criterionId: "correctness.execute_probe",
      layer: "correctness",
      weight: 1,
      pass,
      expected: c.expect.execute,
      actual: executeProbeResult,
    });
  }

  criteria = filterToRubric(criteria, c.rubricCriteria);
  return { criteria, executeProbeResult };
}

export async function evaluateCase(
  c: AiIntentEvalCase,
  options: { liveEnabled: boolean },
): Promise<CaseEvalResult> {
  if (c.layer === "live_optional" && !options.liveEnabled) {
    return {
      caseId: c.id,
      failureClass: c.failureClass,
      layer: c.layer,
      gating: c.gating,
      skipped: true,
      skipReason: "live_optional (set AXTASK_AI_EVAL_LIVE=1 to run)",
      run: null,
      criteria: [],
      pass: false,
    };
  }

  const diagnosisOnly = isDiagnosisOnly(c);

  let run: CaseRunOutcome;
  if (diagnosisOnly) {
    const intent = stubIntent(c);
    if (intent) {
      run = {
        kind: "intent",
        intent,
        provider: "fixture",
        model: "fixture_v1",
        latencyMs: 0,
      };
    } else if (c.llmStub && "error" in c.llmStub) {
      // Drive error stubs through fixture provider for schema_invalid / config / timeout.
      run = await runInterpretCase({
        ...c,
        // Force a message that will miss rule_parser when possible
        input: c.input,
      });
    } else {
      run = await runInterpretCase(c);
    }
  } else {
    run = await runInterpretCase(c);
  }

  const { criteria, executeProbeResult } = scoreCase(c, run, diagnosisOnly);
  const pass = allGatingCriteriaPassed(criteria);

  return {
    caseId: c.id,
    failureClass: c.failureClass,
    layer: c.layer,
    gating: c.gating,
    run,
    criteria,
    pass,
    executeProbe: executeProbeResult,
  };
}

export type RunPackOptions = {
  packRoot?: string;
  repoRoot?: string;
  live?: boolean;
};

export async function runAiIntentEvalPack(options: RunPackOptions = {}): Promise<AiIntentEvalReport> {
  const repoRoot = options.repoRoot ?? resolveRepoRoot();
  const packRoot = resolvePackRoot(repoRoot, options.packRoot);
  const liveEnabled =
    options.live === true ||
    process.env.AXTASK_AI_EVAL_LIVE === "1" ||
    process.env.AXTASK_AI_EVAL_LIVE === "true";

  const { manifest, cases } = loadAiIntentPack(packRoot);
  const results: CaseEvalResult[] = [];

  for (const c of cases) {
    results.push(await evaluateCase(c, { liveEnabled }));
  }

  const ran = results.filter((r) => !r.skipped);
  const skipped = results.filter((r) => r.skipped);
  const gatingCases = ran.filter((r) => r.gating);
  const gatingPassed = gatingCases.filter((r) => r.pass);
  const gatingFailures = gatingCases.length - gatingPassed.length;
  const gatingPassRate = gatingCases.length === 0 ? 1 : gatingPassed.length / gatingCases.length;
  const threshold = manifest.threshold ?? { minGatingPassRate: 1, maxGatingFailures: 0 };
  const thresholdMet =
    gatingPassRate >= threshold.minGatingPassRate && gatingFailures <= threshold.maxGatingFailures;

  const gatingResults: AiIntentEvalReport["gatingResults"] = {};
  for (const r of gatingCases) {
    gatingResults[r.caseId] = {
      pass: r.pass,
      outcome: r.run?.kind ?? null,
      criterionFailures: r.criteria
        .filter((c) => c.layer === "correctness" && c.weight > 0 && !c.pass)
        .map((c) => c.criterionId),
    };
  }

  return {
    schemaVersion: 1,
    packId: manifest.packId,
    generatedAt: new Date().toISOString(),
    packRoot,
    liveEnabled,
    summary: {
      totalCases: cases.length,
      ranCases: ran.length,
      skippedCases: skipped.length,
      gatingCases: gatingCases.length,
      gatingPassed: gatingPassed.length,
      gatingFailures,
      gatingPassRate,
      thresholdMet,
    },
    cases: results,
    gatingResults,
  };
}

export function packExists(packRoot?: string, repoRoot?: string): boolean {
  const root = resolvePackRoot(repoRoot ?? resolveRepoRoot(), packRoot);
  return fs.existsSync(path.join(root, "manifest.v1.json"));
}
