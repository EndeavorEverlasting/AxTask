import { PriorityEngine } from "../../../client/src/lib/priority-engine";
import type { ClassificationAssociation } from "@shared/schema";

export type ClassifierSource = "external_api" | "priority_engine" | "keyword_fallback";

export interface ClassificationResult {
  classification: string;
  confidence: number;
  source: ClassifierSource;
  fallbackLayer: number;
}

interface UniversalClassifierOptions {
  preferExternal?: boolean;
}

const DEFAULT_CLASSIFICATION = "General";
const EXTERNAL_TIMEOUT_MS = 2000;

function normalizeClassification(input?: string | null): string {
  const cleaned = (input || "").trim();
  return cleaned.length > 0 ? cleaned : DEFAULT_CLASSIFICATION;
}

function keywordFallbackClassifier(activity: string, notes: string): string {
  const combined = `${activity} ${notes}`.toLowerCase();
  if (/\b(invoice|billing|payment|receipt|expense)\b/.test(combined)) return "Finance";
  if (/\b(password|login|auth|security|breach)\b/.test(combined)) return "Security";
  if (/\b(customer|client|support|ticket|feedback)\b/.test(combined)) return "Support";
  if (/\b(design|ui|ux|prototype|wireframe)\b/.test(combined)) return "Design";
  return DEFAULT_CLASSIFICATION;
}

async function classifyViaExternalApi(activity: string, notes: string): Promise<ClassificationResult | null> {
  const endpoint = process.env.UNIVERSAL_CLASSIFIER_API_URL?.trim();
  if (!endpoint) return null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (process.env.UNIVERSAL_CLASSIFIER_API_KEY) {
    headers.Authorization = `Bearer ${process.env.UNIVERSAL_CLASSIFIER_API_KEY}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        activity,
        notes,
        text: `${activity}\n${notes}`.trim(),
      }),
    });
    if (!response.ok) return null;

    const body = await response.json() as { classification?: string; confidence?: number };
    const classification = normalizeClassification(body.classification);
    const confidence = typeof body.confidence === "number"
      ? Math.max(0, Math.min(1, body.confidence))
      : 0.8;

    return {
      classification,
      confidence,
      source: "external_api",
      fallbackLayer: 1,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function classifyWithFallback(
  activity: string,
  notes = "",
  options: UniversalClassifierOptions = {},
): Promise<ClassificationResult> {
  const preferExternal = options.preferExternal !== false;

  if (preferExternal) {
    const external = await classifyViaExternalApi(activity, notes);
    if (external) return external;
  }

  const priorityEngineClassification = normalizeClassification(
    PriorityEngine.classifyTask(activity, notes),
  );
  if (priorityEngineClassification !== DEFAULT_CLASSIFICATION) {
    return {
      classification: priorityEngineClassification,
      confidence: 0.72,
      source: "priority_engine",
      fallbackLayer: preferExternal ? 2 : 1,
    };
  }

  return {
    classification: keywordFallbackClassifier(activity, notes),
    confidence: 0.55,
    source: "keyword_fallback",
    fallbackLayer: preferExternal ? 3 : 2,
  };
}

const KEYWORD_RULES: { label: string; re: RegExp; weight: number }[] = [
  { label: "Finance", re: /\b(invoice|billing|payment|receipt|expense)\b/, weight: 1 },
  { label: "Security", re: /\b(password|login|auth|security|breach)\b/, weight: 1 },
  { label: "Support", re: /\b(customer|client|support|ticket|feedback)\b/, weight: 1 },
  { label: "Design", re: /\b(design|ui|ux|prototype|wireframe)\b/, weight: 1 },
];

function normalizeAssociationWeights(rows: ClassificationAssociation[]): ClassificationAssociation[] {
  const sum = rows.reduce((s, r) => s + r.confidence, 0);
  if (sum <= 0) {
    const n = rows.length || 1;
    return rows.map((r) => ({ label: r.label, confidence: Math.round((1 / n) * 1000) / 1000 }));
  }
  return rows.map((r) => ({
    label: r.label,
    confidence: Math.round((r.confidence / sum) * 1000) / 1000,
  }));
}

/** All keyword hits in rule order; confidences normalized to sum ~1. */
function keywordFallbackAssociations(activity: string, notes: string): ClassificationAssociation[] {
  const combined = `${activity} ${notes}`.toLowerCase();
  const ordered: ClassificationAssociation[] = [];
  for (const rule of KEYWORD_RULES) {
    if (rule.re.test(combined)) {
      ordered.push({ label: rule.label, confidence: rule.weight });
    }
  }
  if (ordered.length === 0) {
    return [{ label: DEFAULT_CLASSIFICATION, confidence: 1 }];
  }
  return normalizeAssociationWeights(ordered);
}

/**
 * Primary label (same as classifyWithFallback) plus ranked multi-label confidences.
 */
export async function classifyWithAssociations(
  activity: string,
  notes = "",
  options: UniversalClassifierOptions = {},
): Promise<{ result: ClassificationResult; associations: ClassificationAssociation[] }> {
  const result = await classifyWithFallback(activity, notes, options);
  let associations: ClassificationAssociation[];
  if (result.source === "keyword_fallback") {
    associations = keywordFallbackAssociations(activity, notes);
    const primary = result.classification;
    const primaryIdx = associations.findIndex((a) => a.label === primary);
    if (primaryIdx > 0) {
      const [p] = associations.splice(primaryIdx, 1);
      associations.unshift(p);
    } else if (primaryIdx < 0) {
      associations = [{ label: primary, confidence: result.confidence }, ...associations];
      associations = normalizeAssociationWeights(associations);
    }
  } else {
    associations = [{ label: result.classification, confidence: result.confidence }];
  }
  return { result, associations };
}
