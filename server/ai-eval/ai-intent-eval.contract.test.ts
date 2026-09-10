// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { compareAiIntentBaseline } from "../../scripts/ai-eval/compare-baseline.mjs";
import {
  allGatingCriteriaPassed,
  executeProbe,
  scoreDiagnosis,
  scoreIntentAgainstExpect,
} from "./scorers";
import { FixtureLlmProvider } from "./fixture-provider";
import { packExists, resolvePackRoot, resolveRepoRoot, runAiIntentEvalPack } from "./run-pack";
import type { AiIntentResult } from "../ai/schemas/intent-result";
import { LlmProviderConfigError } from "../ai/contracts/llm-provider";

const repoRoot = resolveRepoRoot();
const packRoot = resolvePackRoot(repoRoot);
const hasPack = packExists(packRoot, repoRoot);

describe("ai-eval scorers (unit)", () => {
  it("scores clarification missingFields", () => {
    const intent: AiIntentResult = {
      type: "clarification",
      payload: {
        question: "How often?",
        reason: "ambiguous",
        missingFields: ["recurrence"],
      },
    };
    const rows = scoreIntentAgainstExpect(
      "unit-1",
      intent,
      {
        outcome: "intent",
        intentType: "clarification",
        missingFieldsContains: ["recurrence"],
        provider: "rule_parser",
      },
      { provider: "rule_parser", outcome: "intent" },
    );
    expect(allGatingCriteriaPassed(rows)).toBe(true);
  });

  it("flags invented offset when noInventedOffset is set", () => {
    const intent: AiIntentResult = {
      type: "create_reminder",
      payload: {
        kind: "location_offset",
        title: "Stretch",
        body: null,
        enabled: true,
        trigger: {
          type: "location_arrival_offset",
          placeSlug: "home",
          offsetMinutes: 15,
        },
      },
    };
    const rows = scoreIntentAgainstExpect("unit-2", intent, {
      outcome: "intent",
      intentType: "create_reminder",
      noInventedOffset: true,
    }, { outcome: "intent" });
    const offsetRow = rows.find((r) => r.criterionId === "correctness.offset_minutes");
    expect(offsetRow?.pass).toBe(false);
  });

  it("executeProbe returns missing_place_alias without context place", () => {
    const intent: AiIntentResult = {
      type: "create_reminder",
      payload: {
        kind: "location_event",
        title: "Reminder",
        trigger: { type: "location_arrival", placeSlug: "home" },
      },
    };
    expect(executeProbe(intent, null)).toEqual({ ok: false, reason: "missing_place_alias" });
    expect(executeProbe(intent, { placeSlug: "home" })).toEqual({ ok: true });
  });

  it("scoreDiagnosis diagnosis-only detects ignored_grounding / reanchor", () => {
    const intent: AiIntentResult = {
      type: "create_reminder",
      payload: {
        kind: "time",
        title: "X",
        taskId: "task_hallucinated_999",
        trigger: { type: "datetime", atIso: "2026-09-10T15:00:00.000Z" },
      },
    };
    const rows = scoreDiagnosis(
      "unit-diag",
      intent,
      {
        expectedFailureClassification: "ignored_grounding",
        expectedRemediation: "reanchor_context",
        canonicalTaskId: "task_eval_001",
      },
      { outcome: "intent" },
      { context: { taskId: "task_eval_001" }, diagnosisOnly: true },
    );
    expect(rows.find((r) => r.criterionId === "correctness.diagnosis_classification")?.pass).toBe(
      true,
    );
    expect(rows.find((r) => r.criterionId === "correctness.diagnosis_remediation")?.pass).toBe(true);
  });

  it("FixtureLlmProvider throws config and schema_invalid", async () => {
    const cfg = new FixtureLlmProvider({ error: "config" });
    await expect(cfg.interpret("x", { nowIso: new Date().toISOString() })).rejects.toBeInstanceOf(
      LlmProviderConfigError,
    );

    const bad = new FixtureLlmProvider({
      error: "schema_invalid",
      invalidIntent: { type: "create_reminder", payload: {} },
    });
    await expect(bad.interpret("x", { nowIso: new Date().toISOString() })).rejects.toThrow();
  });
});

describe("ai-intent-eval contract", () => {
  it.skipIf(!hasPack)("all gating cases in pack pass", async () => {
    const report = await runAiIntentEvalPack({ repoRoot, packRoot });
    const failures = report.cases.filter((c) => c.gating && !c.skipped && !c.pass);
    expect(
      failures.map((f) => ({
        id: f.caseId,
        fails: f.criteria.filter((x) => !x.pass).map((x) => x.criterionId),
      })),
      `gating failures: ${failures.map((f) => f.caseId).join(", ")}`,
    ).toEqual([]);
    expect(report.summary.thresholdMet).toBe(true);
  }, 60_000);

  it.skipIf(!hasPack)("matches baseline when present and non-empty", async () => {
    const baselinePath = path.join(packRoot, "baselines", "v1", "latest.json");
    if (!fs.existsSync(baselinePath)) {
      return;
    }
    const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    const empty =
      baseline.generatedAt == null || Object.keys(baseline.gatingResults ?? {}).length === 0;
    if (empty) {
      // Placeholder baseline from fixtures lane — no regression surface yet.
      expect(true).toBe(true);
      return;
    }
    const report = await runAiIntentEvalPack({ repoRoot, packRoot });
    const compare = compareAiIntentBaseline(baseline, {
      ...report,
      threshold: baseline.threshold,
    });
    expect(compare.ok, compare.regressions.join("\n")).toBe(true);
  }, 60_000);

  it("compare-baseline helper is importable from scripts", async () => {
    const url = pathToFileURL(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "ai-eval", "compare-baseline.mjs"),
    ).href;
    const mod = await import(url);
    expect(typeof mod.compareAiIntentBaseline).toBe("function");
  });
});
