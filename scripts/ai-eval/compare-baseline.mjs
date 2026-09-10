/**
 * Pure baseline compare for AI intent eval reports.
 * Fail-closed: gating pass→fail, missing baseline cases, and threshold misses are regressions.
 */

/**
 * @typedef {{
 *   pass: boolean,
 *   outcome?: string | null,
 *   criterionFailures?: string[],
 * }} GatingEntry
 */

/**
 * @typedef {{
 *   schemaVersion?: number,
 *   packId?: string,
 *   generatedAt?: string | null,
 *   note?: string,
 *   threshold?: { minGatingPassRate?: number, maxGatingFailures?: number },
 *   gatingResults?: Record<string, GatingEntry>,
 *   summary?: {
 *     gatingPassRate?: number,
 *     gatingFailures?: number,
 *     gatingCases?: number,
 *     thresholdMet?: boolean,
 *   },
 * }} BaselineLike
 */

/**
 * @typedef {{
 *   ok: boolean,
 *   regressions: string[],
 *   improvements: string[],
 *   missingFromCurrent: string[],
 *   newGatingFailures: string[],
 *   thresholdViolations: string[],
 *   notes: string[],
 * }} CompareResult
 */

/**
 * @param {BaselineLike | null | undefined} baseline
 * @param {BaselineLike | null | undefined} current
 * @param {{ allowEmptyBaseline?: boolean }} [opts]
 * @returns {CompareResult}
 */
export function compareAiIntentBaseline(baseline, current, opts = {}) {
  const allowEmptyBaseline = opts.allowEmptyBaseline !== false;
  /** @type {CompareResult} */
  const result = {
    ok: true,
    regressions: [],
    improvements: [],
    missingFromCurrent: [],
    newGatingFailures: [],
    thresholdViolations: [],
    notes: [],
  };

  if (!current || typeof current !== "object") {
    result.ok = false;
    result.notes.push("current report is missing or invalid");
    return result;
  }

  const currentResults = current.gatingResults ?? {};
  const baselineResults = baseline?.gatingResults ?? {};
  const baselineEmpty =
    !baseline ||
    baseline.generatedAt == null ||
    Object.keys(baselineResults).length === 0;

  if (baselineEmpty) {
    result.notes.push(
      allowEmptyBaseline
        ? "baseline empty or placeholder — compare skipped (no regression surface)"
        : "baseline empty",
    );
    if (!allowEmptyBaseline) {
      result.ok = false;
    }
  } else {
    for (const [caseId, prev] of Object.entries(baselineResults)) {
      const next = currentResults[caseId];
      if (!next) {
        result.missingFromCurrent.push(caseId);
        result.regressions.push(`${caseId}: present in baseline but missing from current run`);
        continue;
      }
      if (prev.pass && !next.pass) {
        result.regressions.push(
          `${caseId}: gating pass→fail (${(next.criterionFailures ?? []).join(",") || "unknown"})`,
        );
      } else if (!prev.pass && next.pass) {
        result.improvements.push(`${caseId}: gating fail→pass`);
      }
    }
  }

  for (const [caseId, next] of Object.entries(currentResults)) {
    if (!next.pass) {
      const prev = baselineResults[caseId];
      if (!prev || prev.pass) {
        result.newGatingFailures.push(caseId);
      }
    }
  }

  const threshold = current.threshold ?? baseline?.threshold ?? {
    minGatingPassRate: 1,
    maxGatingFailures: 0,
  };
  const summary = current.summary ?? {};
  const passRate =
    typeof summary.gatingPassRate === "number"
      ? summary.gatingPassRate
      : (() => {
          const entries = Object.values(currentResults);
          if (entries.length === 0) return 1;
          return entries.filter((e) => e.pass).length / entries.length;
        })();
  const failures =
    typeof summary.gatingFailures === "number"
      ? summary.gatingFailures
      : Object.values(currentResults).filter((e) => !e.pass).length;

  if (typeof threshold.minGatingPassRate === "number" && passRate < threshold.minGatingPassRate) {
    result.thresholdViolations.push(
      `gatingPassRate ${passRate} < minGatingPassRate ${threshold.minGatingPassRate}`,
    );
  }
  if (typeof threshold.maxGatingFailures === "number" && failures > threshold.maxGatingFailures) {
    result.thresholdViolations.push(
      `gatingFailures ${failures} > maxGatingFailures ${threshold.maxGatingFailures}`,
    );
  }

  if (
    result.regressions.length > 0 ||
    result.thresholdViolations.length > 0 ||
    result.missingFromCurrent.length > 0
  ) {
    result.ok = false;
  }

  // New gating failures (not in baseline as pass) also fail closed when threshold says max 0.
  if (
    typeof threshold.maxGatingFailures === "number" &&
    threshold.maxGatingFailures === 0 &&
    result.newGatingFailures.length > 0
  ) {
    result.ok = false;
  }

  return result;
}

/**
 * Build a baseline document from a full eval report.
 * @param {import('../../server/ai-eval/types.ts').AiIntentEvalReport | BaselineLike} report
 * @param {{ note?: string }} [opts]
 */
export function baselineFromReport(report, opts = {}) {
  return {
    schemaVersion: 1,
    packId: report.packId,
    generatedAt: report.generatedAt ?? new Date().toISOString(),
    note: opts.note ?? "written by scripts/ai-eval/run-ai-intent-eval.mjs --write-baseline",
    threshold: report.threshold,
    gatingResults: report.gatingResults ?? {},
    summary: report.summary,
  };
}
