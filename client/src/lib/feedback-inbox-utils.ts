export type FeedbackInboxItem = {
  id: string;
  createdAt?: string | null;
  actorUserId?: string | null;
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
  message?: string;
  channel?: string;
  reporterEmail?: string;
  reporterName?: string;
  reviewed: boolean;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
};

export function feedbackChannelLabel(channel?: string | null): string {
  switch (channel) {
    case "public_contact":
      return "Public contact";
    case "contact_form":
      return "Contact (signed in)";
    case "feedback_page":
      return "Feedback";
    default:
      return "Other";
  }
}

export type FeedbackSort = "newest" | "oldest" | "critical-first";
export type FeedbackPriorityFilter = "all" | "critical" | "high" | "medium" | "low";
export type FeedbackReviewedFilter = "all" | "reviewed" | "unreviewed";
export type FeedbackReviewerFilter = "all" | "me" | "others";

export type FeedbackFilterState = {
  priority: FeedbackPriorityFilter;
  reviewed: FeedbackReviewedFilter;
  reviewer: FeedbackReviewerFilter;
  tagQuery: string;
  sort: FeedbackSort;
};

function feedbackPriorityRank(priority: string): number {
  switch (priority) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

export function applyFeedbackFilters(
  items: FeedbackInboxItem[],
  filters: FeedbackFilterState,
  currentUserId?: string,
): FeedbackInboxItem[] {
  const filtered = items.filter((item) => {
    const priorityOk =
      filters.priority === "all" || item.priority === filters.priority;
    const reviewedOk =
      filters.reviewed === "all" ||
      (filters.reviewed === "reviewed" ? item.reviewed : !item.reviewed);
    const query = filters.tagQuery.trim().toLowerCase();
    const tagOk =
      query.length === 0 || item.tags.some((tag) => tag.toLowerCase().includes(query));
    const reviewerOk =
      filters.reviewer === "all" ||
      (filters.reviewer === "me" ? item.reviewedBy === currentUserId : item.reviewedBy !== currentUserId);
    return priorityOk && reviewedOk && tagOk && reviewerOk;
  });

  return filtered.sort((a, b) => {
    if (filters.sort === "oldest") {
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    }
    if (filters.sort === "critical-first") {
      const rankDiff = feedbackPriorityRank(b.priority) - feedbackPriorityRank(a.priority);
      if (rankDiff !== 0) return rankDiff;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    }
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });
}

export function buildFeedbackCsv(items: FeedbackInboxItem[]): string {
  const escapeCsv = (value: string | number | boolean | null | undefined) => {
    const raw = String(value ?? "");
    return `"${raw.replace(/"/g, '""')}"`;
  };
  const header = [
    "id",
    "createdAt",
    "actorUserId",
    "channel",
    "reporterEmail",
    "reporterName",
    "priority",
    "classification",
    "sentiment",
    "messageLength",
    "attachments",
    "message",
    "tags",
    "recommendedActions",
    "classifierSource",
    "classifierFallbackLayer",
    "classifierConfidence",
    "reviewed",
    "reviewedBy",
    "reviewedAt",
  ];
  const rows = items.map((item) => [
    item.id,
    item.createdAt || "",
    item.actorUserId || "",
    item.channel || "",
    item.reporterEmail || "",
    item.reporterName || "",
    item.priority,
    item.classification,
    item.sentiment,
    item.messageLength,
    item.attachments,
    item.message || "",
    item.tags.join("|"),
    item.recommendedActions.join("|"),
    item.classifierSource,
    item.classifierFallbackLayer,
    item.classifierConfidence,
    item.reviewed,
    item.reviewedBy || "",
    item.reviewedAt || "",
  ]);
  return [header, ...rows]
    .map((line) => line.map((cell) => escapeCsv(cell)).join(","))
    .join("\n");
}
