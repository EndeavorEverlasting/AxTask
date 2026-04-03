import { PriorityEngine } from "../../../client/src/lib/priority-engine";

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
