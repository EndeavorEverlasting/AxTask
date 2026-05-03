import { PriorityEngine } from "../../../client/src/lib/priority-engine";
import type { ClassificationAssociation } from "@shared/schema";
import { callNodeWeaverBatchClassify } from "./nodeweaver-client";
import { mapNodeWeaverCategoryToAxTaskLabel } from "./nodeweaver-category-map";
import {
  detectShoppingListContent,
  withNodeWeaverShoppingDetection,
  type ShoppingListDetection,
} from "@shared/shopping-tasks";

export type ClassifierSource = "external_api" | "nodeweaver" | "priority_engine" | "keyword_fallback";

export interface ClassificationResult {
  classification: string;
  confidence: number;
  source: ClassifierSource;
  fallbackLayer: number;
}

export interface ShoppingDetectionMetadata {
  detected: boolean;
  format: ShoppingListDetection["format"];
  items: string[];
  confidence: number;
  source: ShoppingListDetection["source"];
}

interface UniversalClassifierOptions {
  preferExternal?: boolean;
}

const DEFAULT_CLASSIFICATION = "General";
const EXTERNAL_TIMEOUT_MS = 2000;
const NODEWEAVER_TIMEOUT_MS = 2000;

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
  if (/\b(buy|grocery|groceries|pick up|shopping list|supermarket|market|store run|shop for|errand)\b/.test(combined))
    return "Shopping";
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

async function classifyViaNodeWeaver(activity: string, notes: string): Promise<ClassificationResult | null> {
  if (!process.env.NODEWEAVER_URL?.trim()) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NODEWEAVER_TIMEOUT_MS);

  try {
    const batch = await callNodeWeaverBatchClassify(
      [{ id: "nw-inline", activity, notes: notes || "" }],
      { signal: controller.signal },
    );
    const row = Array.isArray(batch.results) ? batch.results[0] : undefined;
    const rawCategory = typeof row?.predicted_category === "string" ? row.predicted_category : "";
    const mapped = mapNodeWeaverCategoryToAxTaskLabel(rawCategory);
    if (!mapped) return null;

    const confidence = typeof row?.confidence_score === "number"
      ? Math.max(0, Math.min(1, row.confidence_score))
      : 0.75;

    return {
      classification: normalizeClassification(mapped),
      confidence,
      source: "nodeweaver",
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
  const localShopping = detectShoppingListContent(activity, notes);
  if (localShopping.detected && localShopping.confidence >= 0.72) {
    return {
      classification: "Shopping",
      confidence: localShopping.confidence,
      source: "keyword_fallback",
      fallbackLayer: preferExternal ? 2 : 1,
    };
  }

  if (preferExternal) {
    const external = await classifyViaExternalApi(activity, notes);
    if (external) return external;
  }

  if (preferExternal) {
    const nw = await classifyViaNodeWeaver(activity, notes);
    if (nw) {
      const afterUniversalAttempt = Boolean(process.env.UNIVERSAL_CLASSIFIER_API_URL?.trim());
      return {
        ...nw,
        fallbackLayer: afterUniversalAttempt ? 2 : 1,
      };
    }
  }

  if (preferExternal && !localShopping.detected) {
    const nodeWeaverShopping = await detectShoppingViaNodeWeaverRag(activity, notes, localShopping);
    if (nodeWeaverShopping.detected) {
      return {
        classification: "Shopping",
        confidence: nodeWeaverShopping.confidence,
        source: "nodeweaver",
        fallbackLayer: 2,
      };
    }
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

async function detectShoppingViaNodeWeaverRag(
  activity: string,
  notes: string,
  local: ShoppingListDetection,
): Promise<ShoppingListDetection> {
  if (!process.env.NODEWEAVER_URL?.trim()) return local;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NODEWEAVER_TIMEOUT_MS);
  try {
    const batch = await callNodeWeaverBatchClassify(
      [{ id: "nw-shopping-rag", activity, notes: notes || "" }],
      { signal: controller.signal },
    );
    const row = Array.isArray(batch.results) ? batch.results[0] : undefined;
    const category = typeof row?.predicted_category === "string" ? row.predicted_category : "";
    const confidence =
      typeof row?.confidence_score === "number"
        ? Math.max(0, Math.min(1, row.confidence_score))
        : 0.55;
    return withNodeWeaverShoppingDetection(local, {
      category,
      confidence,
      suggestedItems: local.items,
    });
  } catch {
    return local;
  } finally {
    clearTimeout(timeout);
  }
}

const KEYWORD_RULES: { label: string; re: RegExp; weight: number }[] = [
  { label: "Finance", re: /\b(invoice|billing|payment|receipt|expense)\b/, weight: 1 },
  { label: "Security", re: /\b(password|login|auth|security|breach)\b/, weight: 1 },
  { label: "Support", re: /\b(customer|client|support|ticket|feedback)\b/, weight: 1 },
  { label: "Design", re: /\b(design|ui|ux|prototype|wireframe)\b/, weight: 1 },
  {
    label: "Shopping",
    re: /\b(buy|grocery|groceries|pick up|shopping list|supermarket|market|store run|shop for|errand)\b/,
    weight: 1,
  },
];

export function normalizeAssociationWeights(rows: ClassificationAssociation[]): ClassificationAssociation[] {
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
): Promise<{
  result: ClassificationResult;
  associations: ClassificationAssociation[];
  shoppingDetection: ShoppingDetectionMetadata;
}> {
  const localShopping = detectShoppingListContent(activity, notes);
  const shoppingDetection =
    options.preferExternal !== false
      ? await detectShoppingViaNodeWeaverRag(activity, notes, localShopping)
      : localShopping;
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
  return {
    result,
    associations,
    shoppingDetection: {
      detected: shoppingDetection.detected,
      format: shoppingDetection.format,
      items: shoppingDetection.items,
      confidence: shoppingDetection.confidence,
      source: shoppingDetection.source,
    },
  };
}
