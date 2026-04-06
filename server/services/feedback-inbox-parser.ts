/** Pull a single email token from free text or RFC5322-style display forms. */
function extractEmailForMasking(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const lt = t.indexOf("<");
  const gtIdx = t.lastIndexOf(">");
  if (lt !== -1 && gtIdx > lt) {
    const inner = t.slice(lt + 1, gtIdx).trim();
    if (inner.includes("@")) return inner;
  }
  if (t.includes("@")) return t;
  const m = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(t);
  return m ? m[0] : null;
}

/** Redact reporter email for persisted inbox payloads and exports (do not store raw addresses). */
export function maskReporterEmailForPrivacy(raw: string): string {
  const extracted = extractEmailForMasking(raw);
  if (!extracted) return "[redacted]";
  const trimmed = extracted.trim();
  const atIdx = trimmed.lastIndexOf("@");
  if (atIdx <= 0) return "[redacted]";
  const u = trimmed.slice(0, atIdx);
  const dom = trimmed.slice(atIdx + 1);
  if (!dom) return "[redacted]";
  if (u.length === 1) return `•@${dom}`;
  if (u.length === 2) return `${u[0]}•@${dom}`;
  return `${u.slice(0, 2)}•••@${dom}`;
}

export function maskReporterNameForPrivacy(raw: string): string {
  const t = raw.trim();
  if (!t.length) return "[redacted]";
  if (t.length <= 2) return `${t[0]}•`;
  return `${t.slice(0, 2)}•••`;
}

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
  /** Full message when stored (public contact / contact form). */
  message?: string;
  /** e.g. public_contact | contact_form */
  channel?: string;
  reporterEmail?: string;
  reporterName?: string;
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
      message?: string;
      channel?: string;
      reporterEmail?: string;
      reporterName?: string;
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

    const message =
      typeof parsed.message === "string" && parsed.message.length > 0 ? parsed.message : undefined;
    const channel =
      typeof parsed.channel === "string" && parsed.channel.length > 0 ? parsed.channel : undefined;
    const reporterEmailRaw =
      typeof parsed.reporterEmail === "string" && parsed.reporterEmail.length > 0
        ? parsed.reporterEmail
        : undefined;
    const reporterEmail = reporterEmailRaw ? maskReporterEmailForPrivacy(reporterEmailRaw) : undefined;
    const reporterNameRaw =
      typeof parsed.reporterName === "string" && parsed.reporterName.length > 0
        ? parsed.reporterName
        : undefined;
    const reporterName = reporterNameRaw ? maskReporterNameForPrivacy(reporterNameRaw) : undefined;

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
      message,
      channel,
      reporterEmail,
      reporterName,
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
