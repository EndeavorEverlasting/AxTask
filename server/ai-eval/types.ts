import type { AiIntentResult } from "../ai/schemas/intent-result";

/** Eval pack layer; live_optional is skipped unless AXTASK_AI_EVAL_LIVE=1. */
export type AiIntentEvalLayer = "deterministic" | "integration" | "live_optional";

export type AiIntentEvalOutcome = "intent" | "config_error" | "provider_error";

export type AiIntentTypeExpect = "create_reminder" | "create_task" | "clarification";

export type AiIntentRemediation =
  | "grounding_clarification"
  | "reanchor_context"
  | "schema_reject"
  | "none";

export type AiIntentCaseContext = {
  taskId?: string;
  placeSlug?: string;
  nowIso?: string;
};

/** Successful fixture response. */
export type AiIntentLlmStubIntent = {
  intent: AiIntentResult;
};

/** Error fixture response. */
export type AiIntentLlmStubError = {
  error: "config" | "schema_invalid" | "timeout";
  invalidIntent?: unknown;
};

export type AiIntentLlmStub = AiIntentLlmStubIntent | AiIntentLlmStubError | null;

export type AiIntentExecuteExpect = {
  ok: boolean;
  reason?: string;
} | null;

export type AiIntentCaseExpect = {
  outcome: AiIntentEvalOutcome;
  intentType?: AiIntentTypeExpect;
  provider?: string;
  missingFieldsContains?: string[];
  triggerType?: string;
  placeSlug?: string;
  offsetMinutes?: number | null;
  taskId?: string | null;
  activityContains?: string;
  /** When true, location reminders must not invent an offset (no location_arrival_offset). */
  noInventedOffset?: boolean;
  execute?: AiIntentExecuteExpect;
};

export type AiIntentCaseDiagnosis = {
  expectedFailureClassification: string;
  expectedRemediation: AiIntentRemediation;
  canonicalTaskId?: string;
  canonicalPlaceSlug?: string;
} | null;

/**
 * Optional case mode used by hallucination diagnosis fixtures.
 * - interpret: run product interpretIntent (default)
 * - score_stub_diagnosis: score stub intent + diagnosis without requiring product to fix hallucination
 */
export type AiIntentCaseMode = "interpret" | "score_stub_diagnosis";

export type AiIntentEvalCase = {
  id: string;
  failureClass: string;
  layer: AiIntentEvalLayer;
  input: { message: string };
  context: AiIntentCaseContext | null;
  llmStub: AiIntentLlmStub;
  expect: AiIntentCaseExpect;
  diagnosis: AiIntentCaseDiagnosis;
  rubricCriteria: string[];
  gating: boolean;
  /** Optional; fixtures lane may set this for adversarial diagnosis pairs. */
  mode?: AiIntentCaseMode;
  /** When true, only diagnosis criteria gate the case (interpret may pass through bad stub). */
  expectDiagnosisOnly?: boolean;
};

export type AiIntentEvalManifest = {
  schemaVersion: number;
  packId: string;
  rubricRef: string;
  casesGlob: string;
  baselineRef: string;
  threshold: {
    minGatingPassRate: number;
    maxGatingFailures: number;
  };
  caseIds: string[];
};

export type CriterionLayer = "correctness" | "style";

export type CriterionResult = {
  caseId: string;
  criterionId: string;
  layer: CriterionLayer;
  /** Style criteria are reported but never gate CI (weight 0). */
  weight: number;
  pass: boolean;
  expected: unknown;
  actual: unknown;
  fpRisk?: string;
  fnRisk?: string;
  detail?: string;
};

export type ExecuteProbeResult = {
  ok: boolean;
  reason?: string;
};

export type CaseRunOutcome =
  | { kind: "intent"; intent: AiIntentResult; provider: string; model: string; latencyMs: number }
  | { kind: "config_error"; errorName: string; message: string }
  | { kind: "provider_error"; errorName: string; message: string };

export type CaseEvalResult = {
  caseId: string;
  failureClass: string;
  layer: AiIntentEvalLayer;
  gating: boolean;
  skipped?: boolean;
  skipReason?: string;
  run: CaseRunOutcome | null;
  criteria: CriterionResult[];
  /** True when all gating (correctness, weight>0) criteria pass. Skipped cases are not pass. */
  pass: boolean;
  executeProbe?: ExecuteProbeResult | null;
};

export type AiIntentEvalReportSummary = {
  totalCases: number;
  ranCases: number;
  skippedCases: number;
  gatingCases: number;
  gatingPassed: number;
  gatingFailures: number;
  gatingPassRate: number;
  thresholdMet: boolean;
};

export type AiIntentEvalReport = {
  schemaVersion: 1;
  packId: string;
  generatedAt: string;
  packRoot: string;
  liveEnabled: boolean;
  summary: AiIntentEvalReportSummary;
  cases: CaseEvalResult[];
  /** Compact map used for baseline compare / --write-baseline. */
  gatingResults: Record<
    string,
    {
      pass: boolean;
      outcome: string | null;
      criterionFailures: string[];
    }
  >;
};

export type AiIntentEvalBaseline = {
  schemaVersion: 1;
  packId: string;
  generatedAt: string | null;
  note?: string;
  threshold?: {
    minGatingPassRate: number;
    maxGatingFailures: number;
  };
  gatingResults: Record<
    string,
    {
      pass: boolean;
      outcome?: string | null;
      criterionFailures?: string[];
    }
  >;
  summary?: Partial<AiIntentEvalReportSummary>;
};

export type BaselineCompareResult = {
  ok: boolean;
  regressions: string[];
  improvements: string[];
  missingFromCurrent: string[];
  newGatingFailures: string[];
  thresholdViolations: string[];
  notes: string[];
};
