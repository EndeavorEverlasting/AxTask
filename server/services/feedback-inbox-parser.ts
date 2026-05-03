export type FeedbackInboxPayload = {
  messageLength: number;
  attachments: number;
  classification: string;
  priority: string;
  sentiment: string;
  tags: string[];
  recommendedActions: string[];
  classifierSource: string;
  classifierFallbackLayer: number;
  classifierConfidence: number;
};

export type FeedbackReviewPayload = {
  feedbackEventId: string;
  reviewed: boolean;
};

export function parseFeedbackPayload(
  payloadJson?: string | null,
): FeedbackInboxPayload | null {
  if (!payloadJson) return null;
  try {
    const parsed = JSON.parse(payloadJson) as {
      messageLength?: number;
      attachments?: number;
      analysis?: {
        classification?: string;
        priority?: string;
        sentiment?: string;
        tags?: string[];
        recommendedActions?: string[];
        classifier?: {
          source?: string;
          fallbackLayer?: number;
          confidence?: number;
        };
      };
    };

    const analysis = parsed.analysis;
    if (!analysis) return null;

    return {
      messageLength: Number(parsed.messageLength || 0),
      attachments: Number(parsed.attachments || 0),
      classification: analysis.classification || "General",
      priority: analysis.priority || "low",
      sentiment: analysis.sentiment || "neutral",
      tags: Array.isArray(analysis.tags) ? analysis.tags : [],
      recommendedActions: Array.isArray(analysis.recommendedActions)
        ? analysis.recommendedActions
        : [],
      classifierSource: analysis.classifier?.source || "unknown",
      classifierFallbackLayer: Number(analysis.classifier?.fallbackLayer || 0),
      classifierConfidence: Number(analysis.classifier?.confidence || 0),
    };
  } catch {
    return null;
  }
}

export function parseFeedbackReviewPayload(
  payloadJson?: string | null,
): FeedbackReviewPayload | null {
  if (!payloadJson) return null;
  try {
    const parsed = JSON.parse(payloadJson) as {
      feedbackEventId?: string;
      reviewed?: boolean;
    };
    if (!parsed.feedbackEventId || typeof parsed.feedbackEventId !== "string") {
      return null;
    }
    return {
      feedbackEventId: parsed.feedbackEventId,
      reviewed: parsed.reviewed !== false,
    };
  } catch {
    return null;
  }
}
