import type { SurveyResponse, Survey, FeedbackClassification, CategoryReviewTrigger, ClassificationDispute } from "@shared/schema";

// ─── NodeWeaver Feedback Classification Engine ──────────────────────────────
//
// This engine is the integration point for NodeWeaver. It receives raw feedback
// from surveys, reactions, and free-text inputs, then classifies them into
// actionable categories: bugs, user_errors, feature_requests, praise, and noise.
//
// Architecture:
//   1. Ingest   — normalize raw feedback from multiple source types
//   2. Classify — run through NodeWeaver's classification pipeline
//   3. Enrich   — attach severity, tags, and actionability scores
//   4. Store    — persist classifications for dashboard consumption
//   5. Digest   — aggregate classifications into periodic reports
//
// NodeWeaver integration points are marked with @nodeweaver-hook comments.
// Each hook returns null until NodeWeaver logic is wired in.
// ────────────────────────────────────────────────────────────────────────────

// ─── Types ──────────────────────────────────────────────────────────────────

export type FeedbackCategory =
  | "bug_report"
  | "user_error"
  | "feature_request"
  | "praise"
  | "complaint"
  | "question"
  | "noise";

export type SeverityLevel = "critical" | "high" | "medium" | "low" | "info";

export type FeedbackSourceType =
  | "survey_response"
  | "task_reaction"
  | "text_feedback";

export interface RawFeedbackItem {
  sourceType: FeedbackSourceType;
  sourceId: string;
  userId: string | null;
  content: string;
  promptType?: string;
  surveyQuestion?: string;
  targetModule?: string;
  reactionType?: "thumbsUp" | "thumbsDown";
  taskContext?: {
    taskId: string;
    taskTitle: string;
    classification: string;
    status: string;
  };
  timestamp: string;
}

export interface ClassificationResult {
  category: FeedbackCategory;
  severity: SeverityLevel;
  confidence: number;
  normalizedContent: string;
  tags: string[];
  actionable: boolean;
  metadata: Record<string, unknown>;
}

export interface FeedbackDigest {
  period: { start: string; end: string };
  totalItems: number;
  byCategory: Record<FeedbackCategory, number>;
  bySeverity: Record<SeverityLevel, number>;
  topTags: { tag: string; count: number }[];
  actionableCount: number;
  unresolvedCount: number;
  highlights: DigestHighlight[];
}

export interface DigestHighlight {
  category: FeedbackCategory;
  severity: SeverityLevel;
  summary: string;
  count: number;
  sampleIds: string[];
}

// ─── Step 1: Ingestion — Normalize raw feedback ─────────────────────────────
//
// Converts survey responses, task reactions, and free-text feedback into a
// uniform RawFeedbackItem structure for the classification pipeline.

export function normalizeSurveyResponse(
  response: SurveyResponse,
  survey: Survey
): RawFeedbackItem {
  return {
    sourceType: "survey_response",
    sourceId: response.id,
    userId: response.userId,
    content: response.response,
    promptType: survey.promptType,
    surveyQuestion: survey.question,
    targetModule: survey.targetModule || undefined,
    timestamp: response.createdAt
      ? new Date(response.createdAt).toISOString()
      : new Date().toISOString(),
  };
}

export function normalizeTaskReaction(
  taskId: string,
  userId: string,
  reaction: "thumbsUp" | "thumbsDown",
  taskTitle: string,
  taskClassification: string,
  taskStatus: string
): RawFeedbackItem {
  return {
    sourceType: "task_reaction",
    sourceId: `${taskId}:${userId}:${reaction}`,
    userId,
    content: reaction,
    reactionType: reaction,
    taskContext: {
      taskId,
      taskTitle,
      classification: taskClassification,
      status: taskStatus,
    },
    timestamp: new Date().toISOString(),
  };
}

export function normalizeTextFeedback(
  feedbackId: string,
  userId: string | null,
  text: string,
  module?: string
): RawFeedbackItem {
  return {
    sourceType: "text_feedback",
    sourceId: feedbackId,
    userId,
    content: text,
    targetModule: module,
    timestamp: new Date().toISOString(),
  };
}

// ─── Step 2: Classification — NodeWeaver core pipeline ──────────────────────
//
// @nodeweaver-hook: classifyFeedback
//
// This is the primary classification entry point. NodeWeaver should implement
// the logic to analyze the normalized feedback item and determine:
//   - category: what kind of feedback this is (bug, feature request, etc.)
//   - confidence: how certain the classification is (0.0 to 1.0)
//
// Input:  A RawFeedbackItem with normalized content from any source
// Output: A ClassificationResult with category, severity, confidence, tags
//
// Implementation notes for NodeWeaver:
//   - Thumbs-down reactions on recently completed tasks often indicate bugs
//     or user errors — cross-reference with task classification for context.
//   - Survey "thumbs" type responses map directly to sentiment (thumbsUp=praise,
//     thumbsDown=complaint/bug). Radio/text types need content analysis.
//   - Text content should be scanned for keywords:
//       bug indicators:   "broken", "crash", "error", "doesn't work", "bug"
//       error indicators: "how do I", "can't find", "confused", "where is"
//       feature requests: "wish", "would be nice", "please add", "should have"
//   - targetModule provides context — a bug in "planner" vs "import" may have
//     different severity implications.
//   - Confidence below 0.4 should be tagged as "needs_review" for manual triage.

export async function classifyFeedback(
  _item: RawFeedbackItem
): Promise<ClassificationResult | null> {
  // @nodeweaver-hook: Replace with NodeWeaver classification logic
  //
  // Expected implementation:
  //   1. Tokenize and preprocess item.content
  //   2. Run through category classifier (rule-based or ML)
  //   3. Determine severity based on category + context signals
  //   4. Extract tags from content and metadata
  //   5. Score actionability (bugs/errors = actionable, praise/noise = not)
  //   6. Return ClassificationResult
  //
  // For thumbs-type surveys:
  //   if (item.promptType === "thumbs") {
  //     return item.content === "thumbsDown"
  //       ? { category: "complaint", severity: "medium", ... }
  //       : { category: "praise", severity: "info", ... };
  //   }
  //
  // For task reactions:
  //   if (item.sourceType === "task_reaction") {
  //     const isNegative = item.reactionType === "thumbsDown";
  //     // Cross-ref task classification to determine if bug vs user_error
  //   }
  //
  // For text content:
  //   Run NLP / keyword extraction pipeline

  return null;
}

// ─── Step 3: Enrichment — Add severity, tags, actionability ─────────────────
//
// @nodeweaver-hook: enrichClassification
//
// After initial classification, this step adds contextual enrichment:
//   - Severity scoring based on category + frequency + affected module
//   - Tag extraction from content (module names, error codes, feature areas)
//   - Actionability determination (can the team act on this feedback?)
//   - Deduplication hints (is this similar to existing classifications?)
//
// NodeWeaver should implement pattern matching to identify:
//   - Repeated complaints about the same module → escalate severity
//   - Bug reports with specific error messages → tag with error codes
//   - Feature requests that match existing roadmap items → tag accordingly

export async function enrichClassification(
  _result: ClassificationResult,
  _item: RawFeedbackItem
): Promise<ClassificationResult | null> {
  // @nodeweaver-hook: Replace with NodeWeaver enrichment logic
  //
  // Expected implementation:
  //   1. Look up recent classifications for same module/category
  //   2. If frequency exceeds threshold, bump severity
  //   3. Extract entity tags (module names, error patterns)
  //   4. Check for duplicate/similar content in recent window
  //   5. Set actionable = true for bugs, user_errors, feature_requests
  //   6. Return enriched ClassificationResult

  return null;
}

// ─── Step 4: Full pipeline — Ingest → Classify → Enrich → Store ────────────
//
// Orchestrates the complete feedback processing pipeline.
// Called after survey submissions and reaction events.

export async function processFeedbackItem(
  item: RawFeedbackItem
): Promise<FeedbackClassification | null> {
  const classification = await classifyFeedback(item);
  if (!classification) return null;

  const enriched = await enrichClassification(classification, item);
  const final = enriched || classification;

  // @nodeweaver-hook: persistClassification
  //
  // Store the classification in the feedback_classifications table.
  // This is handled by storage.ts — see storeFeedbackClassification().
  //
  // The return type matches the DB row for feedback_classifications.

  const { storeFeedbackClassification } = await import("../storage");

  return storeFeedbackClassification({
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    userId: item.userId,
    category: final.category,
    severity: final.severity,
    confidence: final.confidence,
    rawContent: item.content,
    normalizedContent: final.normalizedContent,
    tags: final.tags,
    actionable: final.actionable,
    resolved: false,
    metadata: final.metadata,
  });
}

// ─── Step 5: Batch processing — Re-classify historical feedback ─────────────
//
// @nodeweaver-hook: batchClassify
//
// Runs the classification pipeline over unclassified or previously-classified
// survey responses. Useful when the classification model is updated and you
// want to retroactively re-score historical feedback.
//
// NodeWeaver should implement:
//   1. Query all survey_responses without a matching feedback_classification
//   2. Join with surveys table to get question/promptType context
//   3. Run each through processFeedbackItem()
//   4. Report results: { processed, classified, skipped, errors }

export interface BatchResult {
  processed: number;
  classified: number;
  skipped: number;
  errors: number;
  errorDetails: { sourceId: string; error: string }[];
}

export async function batchClassifyResponses(
  _options?: { limit?: number; since?: Date; reprocess?: boolean }
): Promise<BatchResult | null> {
  // @nodeweaver-hook: Replace with NodeWeaver batch processing
  //
  // Expected implementation:
  //   const { getUnclassifiedResponses } = await import("../storage");
  //   const items = await getUnclassifiedResponses(options);
  //   const results = { processed: 0, classified: 0, skipped: 0, errors: 0, errorDetails: [] };
  //   for (const item of items) {
  //     results.processed++;
  //     try {
  //       const classification = await processFeedbackItem(item);
  //       if (classification) results.classified++;
  //       else results.skipped++;
  //     } catch (e) {
  //       results.errors++;
  //       results.errorDetails.push({ sourceId: item.sourceId, error: e.message });
  //     }
  //   }
  //   return results;

  return null;
}

// ─── Step 6: Digest — Aggregate classifications into reports ────────────────
//
// @nodeweaver-hook: generateDigest
//
// Produces a summary of feedback classifications over a time period.
// Used by the admin dashboard to surface trends and actionable items.
//
// NodeWeaver should implement:
//   1. Query feedback_classifications within the date range
//   2. Aggregate counts by category and severity
//   3. Extract top tags by frequency
//   4. Identify highlights (clusters of similar high-severity items)
//   5. Return FeedbackDigest

export async function generateFeedbackDigest(
  _startDate: Date,
  _endDate: Date
): Promise<FeedbackDigest | null> {
  // @nodeweaver-hook: Replace with NodeWeaver digest generation
  //
  // Expected implementation:
  //   const { getFeedbackClassifications } = await import("../storage");
  //   const items = await getFeedbackClassifications({ since: startDate, until: endDate });
  //
  //   // Aggregate by category
  //   const byCategory = items.reduce((acc, item) => {
  //     acc[item.category] = (acc[item.category] || 0) + 1;
  //     return acc;
  //   }, {});
  //
  //   // Aggregate by severity
  //   const bySeverity = items.reduce((acc, item) => {
  //     acc[item.severity] = (acc[item.severity] || 0) + 1;
  //     return acc;
  //   }, {});
  //
  //   // Extract top tags
  //   const tagCounts = {};
  //   items.forEach(i => (i.tags || []).forEach(t => tagCounts[t] = (tagCounts[t]||0)+1));
  //   const topTags = Object.entries(tagCounts)
  //     .sort(([,a],[,b]) => b - a)
  //     .slice(0, 10)
  //     .map(([tag, count]) => ({ tag, count }));
  //
  //   return { period: { start, end }, totalItems, byCategory, bySeverity, topTags, ... };

  return null;
}

// ─── Step 7: Trend detection — Identify feedback spikes ─────────────────────
//
// @nodeweaver-hook: detectTrends
//
// Analyzes recent feedback for sudden spikes in negative sentiment or bug
// reports. Returns alerts when patterns exceed configured thresholds.
//
// NodeWeaver should implement:
//   1. Compare current-window category counts against rolling average
//   2. Flag categories where count > average * threshold_multiplier
//   3. For flagged categories, identify the most common tags/modules
//   4. Return trend alerts with suggested actions

export interface TrendAlert {
  category: FeedbackCategory;
  currentCount: number;
  averageCount: number;
  percentageIncrease: number;
  affectedModules: string[];
  topTags: string[];
  suggestedAction: string;
}

export async function detectFeedbackTrends(
  _windowHours?: number,
  _thresholdMultiplier?: number
): Promise<TrendAlert[] | null> {
  // @nodeweaver-hook: Replace with NodeWeaver trend detection
  //
  // Expected implementation:
  //   const windowMs = (windowHours || 24) * 60 * 60 * 1000;
  //   const threshold = thresholdMultiplier || 2.0;
  //   const since = new Date(Date.now() - windowMs);
  //   const baseline = new Date(Date.now() - windowMs * 7); // 7x window for average
  //
  //   const recent = await getFeedbackClassifications({ since });
  //   const historical = await getFeedbackClassifications({ since: baseline, until: since });
  //
  //   // Compare category frequencies
  //   // Flag anomalies where recent >> historical average
  //   // Return TrendAlert[]

  return null;
}

// ─── Step 8: Resolution suggestions — Auto-triage ───────────────────────────
//
// @nodeweaver-hook: suggestResolution
//
// Given a classified feedback item, suggests resolution actions:
//   - bug_report → create issue, link to relevant code module
//   - user_error → suggest documentation update or UX improvement
//   - feature_request → link to roadmap, suggest priority
//   - complaint → suggest follow-up survey or acknowledgment
//
// NodeWeaver should implement pattern matching against known resolutions
// and return structured suggestions.

export interface ResolutionSuggestion {
  action: string;
  description: string;
  priority: "immediate" | "soon" | "backlog";
  relatedModule: string | null;
  confidence: number;
}

export async function suggestResolution(
  _classification: FeedbackClassification
): Promise<ResolutionSuggestion[] | null> {
  // @nodeweaver-hook: Replace with NodeWeaver resolution suggestions
  //
  // Expected implementation:
  //   Based on classification.category and classification.severity:
  //
  //   if (category === "bug_report" && severity === "critical") {
  //     return [{
  //       action: "create_issue",
  //       description: "Critical bug reported — create tracking issue immediately",
  //       priority: "immediate",
  //       relatedModule: extractModule(classification),
  //       confidence: classification.confidence
  //     }];
  //   }
  //
  //   if (category === "user_error") {
  //     return [{
  //       action: "update_docs",
  //       description: "User confusion detected — review UX for this flow",
  //       priority: "soon",
  //       ...
  //     }];
  //   }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Step 9: Classification Dispute Consensus — AxTask ↔ NodeWeaver boundary
// ═══════════════════════════════════════════════════════════════════════════
//
// Responsibility split:
//   AxTask owns:
//     - Dispute creation, storage, and deduplication (one dispute per user per classification)
//     - Vote collection and tallying (agree/disagree on each dispute)
//     - Consensus tracking per category pair (original → suggested)
//     - Automatic status promotion: monitoring → contested → review_needed
//     - API layer for submitting disputes, casting votes, and querying review triggers
//
//   NodeWeaver owns:
//     - Evaluating whether a review_needed trigger warrants a category redefinition
//     - Adjusting classification rules/weights when consensus confirms a systematic error
//     - Reclassifying historical items affected by a rule change
//     - Reporting back the outcome of a review (accepted, rejected, merged, split)
//
// Data flow:
//   User disputes a classification → AxTask stores dispute + suggested category
//   Other users vote on the dispute → AxTask tracks agree/disagree
//   When enough disputes accumulate with sufficient consensus (≥5 disputes,
//   ≥70% agree), AxTask sets the category_review_triggers row to "review_needed"
//   NodeWeaver polls or is notified of review_needed triggers and acts on them.
//
// Thresholds (configurable in storage.ts):
//   DISPUTE_CONSENSUS_THRESHOLD = 0.7  (70% of voters must agree)
//   DISPUTE_MIN_VOTES = 3              (minimum votes before consensus can fire)
//   REVIEW_TRIGGER_MIN_DISPUTES = 5    (minimum disputes before escalation)

export interface DisputeConsensusResult {
  disputeCount: number;
  agreeCount: number;
  disagreeCount: number;
  consensusRatio: number;
  status: "monitoring" | "contested" | "review_needed" | "resolved";
  recommendation: string | null;
}

export interface CategoryRedefinition {
  originalCategory: string;
  newCategory: string;
  mergeInto: string | null;
  splitFrom: string | null;
  affectedClassificationCount: number;
  reclassifyExisting: boolean;
  rationale: string;
  confidence: number;
}

// @nodeweaver-hook: evaluateReviewTrigger
//
// Called when a category_review_trigger reaches "review_needed" status.
// NodeWeaver should analyze the disputes, votes, and affected classifications
// to determine whether the category definitions need adjustment.
//
// Possible outcomes:
//   - "accepted"  → The original category was wrong; adopt the suggested category.
//                    NodeWeaver should update its rules to classify future items
//                    under the suggested category, and optionally reclassify
//                    historical items.
//   - "rejected"  → The disputes are incorrect; the original classification stands.
//                    NodeWeaver should note this pattern to avoid false triggers.
//   - "merged"    → Both categories are valid but should be combined into one.
//                    NodeWeaver creates a merged category definition.
//   - "split"     → The category is too broad; create sub-categories.
//                    NodeWeaver defines the new sub-category boundaries.
//   - "deferred"  → Not enough signal yet; keep monitoring.
//
// Input:
//   trigger — the category_review_triggers row with vote tallies
//   disputes — all disputes for this category pair with their individual votes
//   sampleClassifications — example feedback items classified under the
//                           original category to help NodeWeaver assess accuracy
//
// Output:
//   CategoryRedefinition describing the proposed change, or null if deferred

export async function evaluateReviewTrigger(
  _trigger: CategoryReviewTrigger,
  _disputes: ClassificationDispute[],
  _sampleClassifications: FeedbackClassification[]
): Promise<CategoryRedefinition | null> {
  // @nodeweaver-hook: Replace with NodeWeaver review evaluation
  //
  // Expected implementation:
  //   1. Analyze the dispute reasons for common themes
  //   2. Compare sample classifications against suggested category rules
  //   3. Run a test reclassification on the samples to measure accuracy shift
  //   4. If accuracy improves ≥ threshold:
  //      return {
  //        originalCategory: trigger.category,
  //        newCategory: trigger.suggestedCategory,
  //        mergeInto: null,
  //        splitFrom: null,
  //        affectedClassificationCount: count of items to reclassify,
  //        reclassifyExisting: true,
  //        rationale: "User consensus + accuracy improvement supports redefinition",
  //        confidence: measured accuracy delta
  //      };
  //   5. If accuracy is ambiguous, return null (deferred)
  //   6. If accuracy worsens, return with reclassifyExisting: false and
  //      rationale explaining the rejection

  return null;
}

// @nodeweaver-hook: applyRedefinition
//
// After a CategoryRedefinition is approved (either automatically via high
// confidence or manually by an admin), this function applies the change:
//   1. Update NodeWeaver's internal classification rules
//   2. Optionally reclassify existing items
//   3. Mark the review trigger as resolved
//
// This is a write operation — NodeWeaver should:
//   - Update whatever model/rules/weights it uses for classifyFeedback()
//   - Call storage.updateFeedbackClassification() for each reclassified item
//   - Return a summary of what changed

export interface RedefinitionResult {
  reclassifiedCount: number;
  rulesUpdated: boolean;
  newRuleDescription: string | null;
  errors: string[];
}

export async function applyRedefinition(
  _redefinition: CategoryRedefinition
): Promise<RedefinitionResult | null> {
  // @nodeweaver-hook: Replace with NodeWeaver rule application
  //
  // Expected implementation:
  //   1. If redefinition.reclassifyExisting:
  //      const affected = await getFeedbackClassifications({
  //        category: redefinition.originalCategory
  //      });
  //      for (const item of affected) {
  //        await updateFeedbackClassification(item.id, {
  //          category: redefinition.newCategory
  //        });
  //        reclassifiedCount++;
  //      }
  //
  //   2. Update internal classification rules:
  //      - Add/modify keyword mappings
  //      - Adjust category boundaries
  //      - Update confidence thresholds
  //
  //   3. Return { reclassifiedCount, rulesUpdated: true, newRuleDescription, errors: [] }

  return null;
}

// @nodeweaver-hook: getDisputeInsights
//
// Provides analytics on dispute patterns to help understand where the
// classifier is systematically wrong. AxTask calls this to show admins
// which categories are most contested and why.
//
// NodeWeaver should analyze:
//   - Which categories get the most disputes (classifier weak points)
//   - Common dispute reasons (what users think is wrong)
//   - Whether disputes cluster around specific modules or content patterns
//   - Historical accuracy of disputes (were past disputes correct?)

export interface DisputeInsight {
  category: string;
  disputeRate: number;
  topSuggestedAlternatives: { category: string; count: number }[];
  commonReasons: string[];
  historicalAccuracy: number | null;
  recommendation: string;
}

export async function getDisputeInsights(): Promise<DisputeInsight[] | null> {
  // @nodeweaver-hook: Replace with NodeWeaver dispute analytics
  //
  // Expected implementation:
  //   const triggers = await getCategoryReviewTriggers();
  //   const insights: DisputeInsight[] = [];
  //
  //   // Group by original category
  //   const byCategory = groupBy(triggers, t => t.category);
  //
  //   for (const [category, categoryTriggers] of Object.entries(byCategory)) {
  //     const topAlternatives = categoryTriggers
  //       .sort((a, b) => b.disputeCount - a.disputeCount)
  //       .map(t => ({ category: t.suggestedCategory, count: t.disputeCount }));
  //
  //     // Analyze dispute reasons via NLP
  //     // Check historical resolution outcomes
  //     // Generate recommendation
  //
  //     insights.push({
  //       category,
  //       disputeRate: calculateDisputeRate(category),
  //       topSuggestedAlternatives: topAlternatives,
  //       commonReasons: extractCommonReasons(categoryTriggers),
  //       historicalAccuracy: lookupHistoricalAccuracy(category),
  //       recommendation: generateRecommendation(...)
  //     });
  //   }
  //
  //   return insights;

  return null;
}
