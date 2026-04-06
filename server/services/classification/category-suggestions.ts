import { classifyWithFallback } from "./universal-classifier";
import { callNodeWeaverBatchClassify } from "./nodeweaver-client";

export type CategorySuggestionSource = "nodeweaver" | "axtask";

export interface CategorySuggestion {
  label: string;
  confidence: number;
  source: CategorySuggestionSource;
}

function normalizeLabel(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function parseFirstBatchResult(result: unknown): {
  predicted?: string;
  confidence?: number;
  alternatives: string[];
} {
  if (!result || typeof result !== "object") return { alternatives: [] };
  const r = result as Record<string, unknown>;
  const predicted = typeof r.predicted_category === "string" ? r.predicted_category : undefined;
  const confidence = typeof r.confidence_score === "number" ? r.confidence_score : undefined;
  const alternatives: string[] = [];
  const rawAlts = r.alternative_categories ?? r.alternatives ?? r.runner_ups ?? r.candidates;
  if (Array.isArray(rawAlts)) {
    for (const item of rawAlts) {
      if (typeof item === "string") {
        alternatives.push(item);
        continue;
      }
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const lab =
          typeof o.category === "string"
            ? o.category
            : typeof o.label === "string"
              ? o.label
              : typeof o.name === "string"
                ? o.name
                : undefined;
        if (lab) alternatives.push(lab);
      }
    }
  }
  return { predicted, confidence, alternatives };
}

/**
 * Merge NodeWeaver batch output (when configured) with the universal classifier stack.
 * Dedupes by case-insensitive label, keeping the highest confidence.
 */
export async function buildCategorySuggestions(activity: string, notes: string): Promise<CategorySuggestion[]> {
  const byKey = new Map<string, CategorySuggestion>();

  const add = (label: string, confidence: number, source: CategorySuggestionSource) => {
    const cleaned = normalizeLabel(label);
    if (cleaned.length < 2) return;
    const key = cleaned.toLowerCase();
    const prev = byKey.get(key);
    if (!prev || confidence > prev.confidence) {
      byKey.set(key, { label: cleaned, confidence: Math.min(1, Math.max(0, confidence)), source });
    }
  };

  if (process.env.NODEWEAVER_URL) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    try {
      const body = await callNodeWeaverBatchClassify(
        [{ id: "__suggest__", activity, notes: notes || "" }],
        { signal: controller.signal },
      );
      const results = Array.isArray((body as { results?: unknown }).results)
        ? (body as { results: unknown[] }).results
        : [];
      const parsed = parseFirstBatchResult(results[0]);
      if (parsed.predicted) {
        add(parsed.predicted, parsed.confidence ?? 0.82, "nodeweaver");
      }
      let altConf = Math.max(0.35, (parsed.confidence ?? 0.72) - 0.1);
      for (const alt of parsed.alternatives) {
        add(alt, altConf, "nodeweaver");
        altConf *= 0.92;
      }
    } catch {
      /* NodeWeaver optional at runtime */
    } finally {
      clearTimeout(timeout);
    }
  }

  const local = await classifyWithFallback(activity, notes, { preferExternal: true });
  add(local.classification, local.confidence, "axtask");

  return Array.from(byKey.values()).sort((a, b) => b.confidence - a.confidence);
}
