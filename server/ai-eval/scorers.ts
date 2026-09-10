import type { AiIntentResult } from "../ai/schemas/intent-result";
import type {
  AiIntentCaseContext,
  AiIntentCaseDiagnosis,
  AiIntentCaseExpect,
  AiIntentRemediation,
  CriterionResult,
  ExecuteProbeResult,
} from "./types";

function criterion(
  caseId: string,
  criterionId: string,
  layer: "correctness" | "style",
  pass: boolean,
  expected: unknown,
  actual: unknown,
  detail?: string,
): CriterionResult {
  return {
    caseId,
    criterionId,
    layer,
    weight: layer === "correctness" ? 1 : 0,
    pass,
    expected,
    actual,
    detail,
  };
}

export function extractTriggerType(intent: AiIntentResult | null | undefined): string | null {
  if (!intent || intent.type !== "create_reminder") return null;
  return intent.payload.trigger.type;
}

export function extractPlaceSlug(intent: AiIntentResult | null | undefined): string | null {
  if (!intent || intent.type !== "create_reminder") return null;
  const trigger = intent.payload.trigger;
  if ("placeSlug" in trigger) return trigger.placeSlug;
  return null;
}

export function extractOffsetMinutes(intent: AiIntentResult | null | undefined): number | null {
  if (!intent || intent.type !== "create_reminder") return null;
  const trigger = intent.payload.trigger;
  if (trigger.type === "location_arrival_offset") return trigger.offsetMinutes;
  return null;
}

export function extractTaskId(intent: AiIntentResult | null | undefined): string | null {
  if (!intent || intent.type !== "create_reminder") return null;
  return intent.payload.taskId ?? null;
}

export function extractMissingFields(intent: AiIntentResult | null | undefined): string[] {
  if (!intent || intent.type !== "clarification") return [];
  return intent.payload.missingFields ?? [];
}

function isBlankSlug(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

/**
 * Thin deterministic execute probe (no DB).
 * - Location triggers require a non-blank placeSlug present in context matching intent.
 * - Blank placeSlug → missing_place_alias.
 * - Context place/task divergence → ignored_grounding.
 */
export function executeProbe(
  intent: AiIntentResult,
  context: AiIntentCaseContext | null,
): ExecuteProbeResult {
  if (intent.type === "clarification") {
    return { ok: false, reason: "clarification" };
  }

  if (intent.type === "create_task") {
    return { ok: true };
  }

  const placeSlug = extractPlaceSlug(intent);
  const taskId = extractTaskId(intent);
  const ctx = context ?? {};
  const hasLocationTrigger =
    intent.payload.trigger.type === "location_arrival" ||
    intent.payload.trigger.type === "location_arrival_offset" ||
    intent.payload.trigger.type === "location_departure";

  if (hasLocationTrigger) {
    if (isBlankSlug(placeSlug)) {
      return { ok: false, reason: "missing_place_alias" };
    }
    if (!ctx.placeSlug) {
      return { ok: false, reason: "missing_place_alias" };
    }
    if (ctx.placeSlug !== placeSlug) {
      return { ok: false, reason: "ignored_grounding" };
    }
  }

  if (ctx.taskId != null && taskId != null && ctx.taskId !== taskId) {
    return { ok: false, reason: "ignored_grounding" };
  }

  if (
    ctx.taskId != null &&
    (taskId == null || taskId === "") &&
    (intent.payload.trigger.type === "datetime" || intent.payload.trigger.type === "recurring_time")
  ) {
    return { ok: false, reason: "ignored_grounding" };
  }

  return { ok: true };
}

export type ScoreIntentOptions = {
  provider?: string | null;
  outcome?: string;
  /** When true, place/task expect fields score as grounded targets vs adversarial stub. */
  diagnosisOnly?: boolean;
  diagnosis?: AiIntentCaseDiagnosis;
  context?: AiIntentCaseContext | null;
};

/**
 * Score product (or stub) intent fields against case.expect.
 * Criterion ids match evals/ai-intent/rubrics/v1.json (snake_case).
 */
export function scoreIntentAgainstExpect(
  caseId: string,
  actual: AiIntentResult | null,
  expect: AiIntentCaseExpect,
  meta?: ScoreIntentOptions,
): CriterionResult[] {
  const results: CriterionResult[] = [];
  const diagnosisOnly = meta?.diagnosisOnly === true;

  if (expect.outcome) {
    const actualOutcome = meta?.outcome ?? (actual ? "intent" : null);
    results.push(
      criterion(
        caseId,
        "correctness.outcome",
        "correctness",
        actualOutcome === expect.outcome,
        expect.outcome,
        actualOutcome,
      ),
    );
  }

  if (expect.intentType != null) {
    results.push(
      criterion(
        caseId,
        "correctness.intent_type",
        "correctness",
        actual?.type === expect.intentType,
        expect.intentType,
        actual?.type ?? null,
      ),
    );
  }

  if (expect.provider != null) {
    results.push(
      criterion(
        caseId,
        "correctness.provider",
        "correctness",
        meta?.provider === expect.provider,
        expect.provider,
        meta?.provider ?? null,
      ),
    );
  }

  if (expect.missingFieldsContains != null && expect.missingFieldsContains.length > 0) {
    const fields = extractMissingFields(actual);
    const missing = expect.missingFieldsContains.filter(
      (f) =>
        !fields.some(
          (x) => x.toLowerCase().includes(f.toLowerCase()) || f.toLowerCase().includes(x.toLowerCase()),
        ),
    );
    results.push(
      criterion(
        caseId,
        "correctness.missing_fields",
        "correctness",
        missing.length === 0,
        expect.missingFieldsContains,
        fields,
        missing.length ? `missing: ${missing.join(",")}` : undefined,
      ),
    );
  }

  if (expect.triggerType != null) {
    const triggerType = extractTriggerType(actual);
    results.push(
      criterion(
        caseId,
        "correctness.trigger_type",
        "correctness",
        triggerType === expect.triggerType,
        expect.triggerType,
        triggerType,
      ),
    );
  }

  if (expect.placeSlug !== undefined) {
    const placeSlug = extractPlaceSlug(actual);
    const canonical =
      meta?.diagnosis?.canonicalPlaceSlug ?? meta?.context?.placeSlug ?? expect.placeSlug;
    let pass = placeSlug === expect.placeSlug;
    if (diagnosisOnly && meta?.diagnosis?.expectedRemediation === "reanchor_context") {
      // Expect holds the grounded target; stub may diverge — pass when target is canonical and stub diverged.
      pass = expect.placeSlug === canonical && placeSlug !== expect.placeSlug;
    } else if (diagnosisOnly && meta?.diagnosis?.expectedRemediation === "schema_reject") {
      pass = expect.placeSlug === canonical && isBlankSlug(placeSlug);
    }
    results.push(
      criterion(
        caseId,
        "correctness.place_slug",
        "correctness",
        pass,
        expect.placeSlug,
        placeSlug,
      ),
    );
  }

  if (expect.offsetMinutes !== undefined || expect.noInventedOffset === true) {
    const offset = extractOffsetMinutes(actual);
    const triggerType = extractTriggerType(actual);
    if (expect.offsetMinutes !== undefined) {
      results.push(
        criterion(
          caseId,
          "correctness.offset_minutes",
          "correctness",
          offset === expect.offsetMinutes,
          expect.offsetMinutes,
          offset,
        ),
      );
    }
    if (expect.noInventedOffset === true) {
      const pass = triggerType !== "location_arrival_offset" && offset == null;
      results.push(
        criterion(
          caseId,
          "correctness.offset_minutes",
          "correctness",
          pass,
          { noInventedOffset: true },
          { triggerType, offsetMinutes: offset },
        ),
      );
    }
  }

  if (expect.taskId !== undefined) {
    const taskId = extractTaskId(actual);
    const canonical = meta?.diagnosis?.canonicalTaskId ?? meta?.context?.taskId ?? expect.taskId;
    let pass = taskId === expect.taskId;
    if (diagnosisOnly && meta?.diagnosis?.expectedRemediation === "reanchor_context") {
      pass = expect.taskId === canonical && taskId !== expect.taskId;
    }
    results.push(
      criterion(
        caseId,
        "correctness.task_id",
        "correctness",
        pass,
        expect.taskId,
        taskId,
      ),
    );
  }

  if (expect.activityContains != null) {
    const activity =
      actual?.type === "create_task"
        ? actual.payload.activity
        : actual?.type === "create_reminder"
          ? actual.payload.title
          : "";
    const pass = activity.toLowerCase().includes(expect.activityContains.toLowerCase());
    results.push(
      criterion(
        caseId,
        "correctness.activity",
        "correctness",
        pass,
        expect.activityContains,
        activity,
      ),
    );
  }

  // Fail-closed: config/provider errors must not yield create_* intents.
  if (expect.outcome === "config_error" || expect.outcome === "provider_error") {
    const leakedCreate =
      actual != null && (actual.type === "create_reminder" || actual.type === "create_task");
    results.push(
      criterion(
        caseId,
        "correctness.fail_closed",
        "correctness",
        !leakedCreate && meta?.outcome === expect.outcome,
        { outcome: expect.outcome, noCreateIntent: true },
        { outcome: meta?.outcome ?? null, intentType: actual?.type ?? null },
      ),
    );
  }

  return results;
}

export type ObservedDiagnosis = {
  failureClassification: string | null;
  remediation: AiIntentRemediation;
  divergedTaskId: boolean;
  divergedPlaceSlug: boolean;
  malformedPlaceSlug: boolean;
};

/**
 * Derive failure classification + remediation from actual intent vs diagnosis/context.
 */
export function observeDiagnosis(
  actualIntent: AiIntentResult | null,
  diagnosis: NonNullable<AiIntentCaseDiagnosis>,
  context: AiIntentCaseContext | null,
): ObservedDiagnosis {
  const canonicalTaskId = diagnosis.canonicalTaskId ?? context?.taskId;
  const canonicalPlaceSlug = diagnosis.canonicalPlaceSlug ?? context?.placeSlug;
  const actualTaskId = extractTaskId(actualIntent);
  const actualPlaceSlug = extractPlaceSlug(actualIntent);

  const malformedPlaceSlug =
    actualIntent?.type === "create_reminder" &&
    (actualIntent.payload.trigger.type === "location_arrival" ||
      actualIntent.payload.trigger.type === "location_arrival_offset" ||
      actualIntent.payload.trigger.type === "location_departure") &&
    isBlankSlug(actualPlaceSlug);

  if (malformedPlaceSlug) {
    return {
      failureClassification: "malformed_tool_params",
      remediation: "schema_reject",
      divergedTaskId: false,
      divergedPlaceSlug: false,
      malformedPlaceSlug: true,
    };
  }

  const divergedTaskId =
    canonicalTaskId != null && actualTaskId != null && actualTaskId !== canonicalTaskId;
  const divergedPlaceSlug =
    canonicalPlaceSlug != null &&
    actualPlaceSlug != null &&
    !isBlankSlug(actualPlaceSlug) &&
    actualPlaceSlug !== canonicalPlaceSlug;

  const missingFields = extractMissingFields(actualIntent);
  const isClarification = actualIntent?.type === "clarification";

  if (divergedTaskId || divergedPlaceSlug) {
    return {
      failureClassification: "ignored_grounding",
      remediation: "reanchor_context",
      divergedTaskId,
      divergedPlaceSlug,
      malformedPlaceSlug: false,
    };
  }

  if (isClarification) {
    const wantsTask = missingFields.some((f) => /task/i.test(f));
    const wantsPlace = missingFields.some((f) => /place/i.test(f));
    if (wantsTask || wantsPlace) {
      return {
        failureClassification: wantsTask ? "missing_task_context" : "missing_place_alias",
        remediation: "grounding_clarification",
        divergedTaskId,
        divergedPlaceSlug,
        malformedPlaceSlug: false,
      };
    }
  }

  if (
    diagnosis.expectedRemediation === "schema_reject" ||
    diagnosis.expectedFailureClassification === "schema_reject"
  ) {
    return {
      failureClassification: "schema_reject",
      remediation: "schema_reject",
      divergedTaskId,
      divergedPlaceSlug,
      malformedPlaceSlug: false,
    };
  }

  return {
    failureClassification: null,
    remediation: "none",
    divergedTaskId,
    divergedPlaceSlug,
    malformedPlaceSlug: false,
  };
}

/**
 * Score diagnosis expectations.
 *
 * Product interpret mode (default):
 * - reanchor_context requires actual taskId/placeSlug to match canonical (else remediationMatch fails).
 * - grounding_clarification passes when clarification includes appropriate missingFields.
 *
 * score_stub_diagnosis / expectDiagnosisOnly:
 * - remediation passes when observed remediation equals expected (framework classifies bad stub).
 */
export function scoreDiagnosis(
  caseId: string,
  actualIntent: AiIntentResult | null,
  diagnosis: AiIntentCaseDiagnosis,
  expect: AiIntentCaseExpect,
  options?: {
    context?: AiIntentCaseContext | null;
    diagnosisOnly?: boolean;
    outcome?: string;
  },
): CriterionResult[] {
  if (!diagnosis) return [];

  const context = options?.context ?? null;
  const diagnosisOnly = options?.diagnosisOnly === true;
  const observed = observeDiagnosis(actualIntent, diagnosis, context);
  const results: CriterionResult[] = [];

  results.push(
    criterion(
      caseId,
      "correctness.diagnosis_classification",
      "correctness",
      observed.failureClassification === diagnosis.expectedFailureClassification,
      diagnosis.expectedFailureClassification,
      observed.failureClassification,
    ),
  );

  let remediationPass = false;

  if (diagnosisOnly) {
    remediationPass = observed.remediation === diagnosis.expectedRemediation;
  } else if (diagnosis.expectedRemediation === "reanchor_context") {
    const taskOk =
      diagnosis.canonicalTaskId == null || extractTaskId(actualIntent) === diagnosis.canonicalTaskId;
    const placeOk =
      diagnosis.canonicalPlaceSlug == null ||
      extractPlaceSlug(actualIntent) === diagnosis.canonicalPlaceSlug;
    remediationPass = taskOk && placeOk && !observed.divergedTaskId && !observed.divergedPlaceSlug;
  } else if (diagnosis.expectedRemediation === "grounding_clarification") {
    const fields = extractMissingFields(actualIntent);
    const required = expect.missingFieldsContains ?? [];
    const hasGroundingFields =
      actualIntent?.type === "clarification" &&
      (required.length === 0
        ? fields.some((f) => /task|place|offset|time|recurrence/i.test(f))
        : required.every((f) => fields.some((x) => x.toLowerCase().includes(f.toLowerCase()))));
    remediationPass = hasGroundingFields;
  } else if (diagnosis.expectedRemediation === "schema_reject") {
    remediationPass =
      options?.outcome === "provider_error" ||
      observed.remediation === "schema_reject" ||
      (actualIntent?.type === "clarification" &&
        /schema|parse|invalid/i.test(actualIntent.payload.reason ?? ""));
  } else {
    remediationPass = observed.remediation === "none" || diagnosis.expectedRemediation === "none";
  }

  results.push(
    criterion(
      caseId,
      "correctness.diagnosis_remediation",
      "correctness",
      remediationPass,
      diagnosis.expectedRemediation,
      diagnosisOnly
        ? observed.remediation
        : {
            expected: diagnosis.expectedRemediation,
            divergedTaskId: observed.divergedTaskId,
            divergedPlaceSlug: observed.divergedPlaceSlug,
            actualTaskId: extractTaskId(actualIntent),
            actualPlaceSlug: extractPlaceSlug(actualIntent),
          },
    ),
  );

  return results;
}

/** Optional style criterion (weight 0) when listed in rubricCriteria. */
export function scoreStyleCriteria(
  caseId: string,
  actual: AiIntentResult | null,
  rubricCriteria: string[] | undefined,
): CriterionResult[] {
  if (!rubricCriteria?.includes("style.clarification_question")) return [];
  if (actual?.type !== "clarification") {
    return [
      criterion(
        caseId,
        "style.clarification_question",
        "style",
        true,
        "clarification question present when applicable",
        null,
        "not a clarification intent",
      ),
    ];
  }
  const q = actual.payload.question?.trim() ?? "";
  const pass = q.length >= 8;
  return [
    criterion(
      caseId,
      "style.clarification_question",
      "style",
      pass,
      "non-empty actionable clarification question",
      q,
    ),
  ];
}

/** True when every correctness criterion with weight > 0 passed. */
export function allGatingCriteriaPassed(criteria: CriterionResult[]): boolean {
  const gating = criteria.filter((c) => c.layer === "correctness" && c.weight > 0);
  if (gating.length === 0) return true;
  return gating.every((c) => c.pass);
}
