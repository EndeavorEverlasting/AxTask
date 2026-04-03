import { classifyWithFallback } from "../services/classification/universal-classifier";

export type FeedbackPriority = "low" | "medium" | "high" | "critical";

export interface FeedbackAnalysis {
  classification: string;
  priority: FeedbackPriority;
  sentiment: "positive" | "neutral" | "negative";
  tags: string[];
  recommendedActions: string[];
  classifier: {
    source: string;
    fallbackLayer: number;
    confidence: number;
  };
}

function derivePriority(text: string): FeedbackPriority {
  const lower = text.toLowerCase();
  if (/\b(crash|data loss|security|breach|blocked|cannot login|payment failed)\b/.test(lower)) {
    return "critical";
  }
  if (/\b(error|broken|urgent|failed|cannot|can't|won't)\b/.test(lower)) {
    return "high";
  }
  if (/\b(slow|confusing|improve|request|idea)\b/.test(lower)) {
    return "medium";
  }
  return "low";
}

function deriveSentiment(text: string): "positive" | "neutral" | "negative" {
  const lower = text.toLowerCase();
  const positive = /\b(great|love|thanks|awesome|helpful|works well)\b/.test(lower);
  const negative = /\b(bad|hate|broken|frustrating|terrible|awful)\b/.test(lower);
  if (positive && !negative) return "positive";
  if (negative && !positive) return "negative";
  return "neutral";
}

function deriveTags(text: string, attachmentCount: number): string[] {
  const lower = text.toLowerCase();
  const tags = new Set<string>();

  if (attachmentCount > 0) tags.add("has-screenshots");
  if (/\b(ui|layout|button|screen|mobile)\b/.test(lower)) tags.add("ui");
  if (/\b(api|request|timeout|server|backend)\b/.test(lower)) tags.add("backend");
  if (/\b(login|password|auth|security)\b/.test(lower)) tags.add("auth-security");
  if (/\b(feature|request|idea|enhancement)\b/.test(lower)) tags.add("feature-request");
  if (/\b(crash|error|bug|failed)\b/.test(lower)) tags.add("bug");

  return Array.from(tags);
}

function recommendedActions(priority: FeedbackPriority, tags: string[]): string[] {
  const actions: string[] = [];
  if (priority === "critical") actions.push("Escalate immediately to on-call owner.");
  if (priority === "high") actions.push("Triage in the next sprint planning cycle.");
  if (tags.includes("has-screenshots")) actions.push("Review screenshots before reproducing issue.");
  if (tags.includes("feature-request")) actions.push("Link to product backlog and gather impact notes.");
  if (actions.length === 0) actions.push("Queue for normal feedback review.");
  return actions;
}

export async function processFeedbackWithEngines(
  message: string,
  attachmentCount: number,
): Promise<FeedbackAnalysis> {
  const text = message.trim();
  const classifier = await classifyWithFallback(text, "", { preferExternal: true });
  const priority = derivePriority(text);
  const sentiment = deriveSentiment(text);
  const tags = deriveTags(text, attachmentCount);

  return {
    classification: classifier.classification,
    priority,
    sentiment,
    tags,
    recommendedActions: recommendedActions(priority, tags),
    classifier: {
      source: classifier.source,
      fallbackLayer: classifier.fallbackLayer,
      confidence: classifier.confidence,
    },
  };
}
