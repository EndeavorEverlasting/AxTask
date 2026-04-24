import type { Task, TaskPattern } from "@shared/schema";
import { upsertPattern, getPatterns, deleteStalePatterns } from "../storage";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

function tokenize(text: string): string[] {
  const stops = new Set(["the", "a", "an", "to", "for", "and", "or", "my", "i", "is", "it", "of", "in", "on", "at", "with"]);
  return normalizeText(text).split(/\s+/).filter(w => w.length > 1 && !stops.has(w));
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.abs(Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)));
}

function detectCadence(intervals: number[]): { cadence: string; avgDays: number } {
  if (intervals.length === 0) return { cadence: "unknown", avgDays: 0 };
  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;

  if (avg <= 1.5) return { cadence: "daily", avgDays: Math.round(avg) };
  if (avg <= 4) return { cadence: "every_few_days", avgDays: Math.round(avg) };
  if (avg <= 9) return { cadence: "weekly", avgDays: Math.round(avg) };
  if (avg <= 18) return { cadence: "biweekly", avgDays: Math.round(avg) };
  if (avg <= 35) return { cadence: "monthly", avgDays: Math.round(avg) };
  return { cadence: "occasional", avgDays: Math.round(avg) };
}

interface TopicData {
  topic: string;
  count: number;
  avgPriorityScore: number;
  classifications: string[];
  recentActivities: string[];
  taskIds?: string[];
}

interface RecurrenceData {
  activity: string;
  count: number;
  cadence: string;
  avgDays: number;
  typicalDayOfWeek: string;
  typicalDayIndex: number;
  lastDate: string;
  nextExpectedDate: string;
  taskIds?: string[];
}

interface DeadlineRhythmData {
  activity: string;
  typicalDayOfWeek: string;
  typicalDayIndex: number;
  avgDays: number;
  cadence: string;
  dates: string[];
}

export interface PatternInsight {
  type: "topic" | "recurrence" | "deadline_rhythm" | "similarity_cluster";
  title: string;
  description: string;
  confidence: number;
  /**
   * Up to 5 concrete task ids this insight points at, when available. Enables
   * click-through from the planner insights list to the exact task's edit
   * dialog. Aggregate-only insights (e.g. `deadline_rhythm`) omit the field
   * so callers fall back to an activity-prefilled search.
   */
  taskIds?: string[];
  data: TopicData | RecurrenceData | DeadlineRhythmData | Record<string, unknown>;
}

export interface DeadlineSuggestion {
  suggestedDate: string;
  reason: string;
  confidence: number;
  pattern: string;
}

export interface GroceryPurchaseEvent {
  label: string;
  purchasedAt: Date;
}

export interface GroceryRepurchaseSuggestion {
  item: string;
  suggestedDate: string;
  confidence: number;
  reason: string;
  avgDays: number;
  lastPurchasedAt: string;
  source: "purchase_history" | "task_patterns" | "blended";
}

const MAX_TASKS_FOR_ANALYSIS = 500;

export async function analyzeTaskHistory(userId: string, allTasks: Task[]): Promise<TaskPattern[]> {
  if (allTasks.length < 3) return [];

  await deleteStalePatterns(userId, 120);

  const sorted = [...allTasks].sort((a, b) => {
    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return db - da;
  });
  const recentTasks = sorted.slice(0, MAX_TASKS_FOR_ANALYSIS);

  const results: TaskPattern[] = [];

  const topicPatterns = await extractTopics(userId, recentTasks);
  results.push(...topicPatterns);

  const recurrencePatterns = await detectRecurrences(userId, recentTasks);
  results.push(...recurrencePatterns);

  const rhythmPatterns = await detectDeadlineRhythms(userId, recentTasks);
  results.push(...rhythmPatterns);

  const clusterPatterns = await buildSimilarityClusters(userId, recentTasks);
  results.push(...clusterPatterns);

  return results;
}

async function extractTopics(userId: string, allTasks: Task[]): Promise<TaskPattern[]> {
  const topicMap = new Map<string, { count: number; scores: number[]; classifications: Set<string>; activities: string[]; taskIds: string[] }>();

  for (const task of allTasks) {
    const tokens = tokenize(task.activity);
    const bigrams: string[] = [];
    for (let i = 0; i < tokens.length - 1; i++) {
      bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
    }

    const phrases = [...tokens, ...bigrams];
    for (const phrase of phrases) {
      if (!topicMap.has(phrase)) {
        topicMap.set(phrase, { count: 0, scores: [], classifications: new Set(), activities: [], taskIds: [] });
      }
      const entry = topicMap.get(phrase)!;
      entry.count++;
      entry.scores.push(task.priorityScore);
      entry.classifications.add(task.classification);
      if (entry.activities.length < 5) entry.activities.push(task.activity);
      if (entry.taskIds.length < 5) entry.taskIds.push(task.id);
    }
  }

  const significantTopics = Array.from(topicMap.entries())
    .filter(([, data]) => data.count >= 3)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 50);

  const results: TaskPattern[] = [];
  for (const [topic, data] of significantTopics) {
    const confidence = Math.min(100, Math.round((data.count / allTasks.length) * 100 + data.count * 5));
    const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;

    const topicData: TopicData = {
      topic,
      count: data.count,
      avgPriorityScore: Math.round(avgScore * 10) / 10,
      classifications: Array.from(data.classifications),
      recentActivities: data.activities.slice(0, 3),
      taskIds: data.taskIds.slice(0, 5),
    };

    const pattern = await upsertPattern(userId, "topic", topic, topicData as unknown as Record<string, unknown>, confidence);
    results.push(pattern);
  }

  return results;
}

async function detectRecurrences(userId: string, allTasks: Task[]): Promise<TaskPattern[]> {
  const groups = new Map<string, Task[]>();

  for (const task of allTasks) {
    const normalized = normalizeText(task.activity);
    let matched = false;

    for (const [key, group] of groups) {
      const sim = jaccardSimilarity(tokenize(key), tokenize(normalized));
      if (sim >= 0.5) {
        group.push(task);
        matched = true;
        break;
      }
    }

    if (!matched) {
      groups.set(normalized, [task]);
    }
  }

  const results: TaskPattern[] = [];

  for (const [key, group] of groups) {
    if (group.length < 2) continue;

    const sorted = group
      .filter(t => t.date)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (sorted.length < 2) continue;

    const intervals: number[] = [];
    const dayIndices: number[] = [];

    for (let i = 1; i < sorted.length; i++) {
      intervals.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    }

    for (const t of sorted) {
      const d = new Date(t.date);
      if (!isNaN(d.getTime())) dayIndices.push(d.getDay());
    }

    const { cadence, avgDays } = detectCadence(intervals);

    const dayFreq = new Map<number, number>();
    for (const d of dayIndices) dayFreq.set(d, (dayFreq.get(d) || 0) + 1);
    let typicalDayIdx = 0;
    let maxDayFreq = 0;
    for (const [day, freq] of dayFreq) {
      if (freq > maxDayFreq) { maxDayFreq = freq; typicalDayIdx = day; }
    }

    const lastDate = sorted[sorted.length - 1].date;
    const nextExpected = new Date(lastDate);
    nextExpected.setDate(nextExpected.getDate() + (avgDays || 7));
    const nextExpectedStr = nextExpected.toISOString().split("T")[0];

    const confidence = Math.min(100, Math.round(group.length * 15 + (cadence !== "unknown" ? 20 : 0)));

    const recurrenceData: RecurrenceData = {
      activity: group[0].activity,
      count: group.length,
      cadence,
      avgDays,
      typicalDayOfWeek: DAYS[typicalDayIdx],
      typicalDayIndex: typicalDayIdx,
      lastDate,
      nextExpectedDate: nextExpectedStr,
      /* Most recent recurrence occurrences first so the primary click target
         is the freshest task the user is likely still thinking about. */
      taskIds: sorted.slice(-5).reverse().map((t) => t.id),
    };

    const pattern = await upsertPattern(userId, "recurrence", key, recurrenceData as unknown as Record<string, unknown>, confidence);
    results.push(pattern);
  }

  return results;
}

async function detectDeadlineRhythms(userId: string, allTasks: Task[]): Promise<TaskPattern[]> {
  const classGroups = new Map<string, Task[]>();

  for (const task of allTasks) {
    if (!task.date) continue;
    const cls = task.classification || "General";
    if (!classGroups.has(cls)) classGroups.set(cls, []);
    classGroups.get(cls)!.push(task);
  }

  const results: TaskPattern[] = [];

  for (const [cls, group] of classGroups) {
    if (group.length < 3) continue;

    const sorted = group.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const intervals: number[] = [];
    const dayIndices: number[] = [];

    for (let i = 1; i < sorted.length; i++) {
      intervals.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    }

    for (const t of sorted) {
      const d = new Date(t.date);
      if (!isNaN(d.getTime())) dayIndices.push(d.getDay());
    }

    if (intervals.length === 0) continue;

    const { cadence, avgDays } = detectCadence(intervals);
    if (cadence === "unknown" || cadence === "occasional") continue;

    const dayFreq = new Map<number, number>();
    for (const d of dayIndices) dayFreq.set(d, (dayFreq.get(d) || 0) + 1);
    let typicalDayIdx = 0;
    let maxDayFreq = 0;
    for (const [day, freq] of dayFreq) {
      if (freq > maxDayFreq) { maxDayFreq = freq; typicalDayIdx = day; }
    }

    const dayDominance = dayIndices.length > 0 ? maxDayFreq / dayIndices.length : 0;
    if (dayDominance < 0.3) continue;

    const confidence = Math.min(100, Math.round(group.length * 10 + dayDominance * 40));

    const rhythmData: DeadlineRhythmData = {
      activity: `${cls} tasks`,
      typicalDayOfWeek: DAYS[typicalDayIdx],
      typicalDayIndex: typicalDayIdx,
      avgDays,
      cadence,
      dates: sorted.slice(-5).map(t => t.date),
    };

    const pattern = await upsertPattern(userId, "deadline_rhythm", `rhythm:${cls.toLowerCase()}`, rhythmData as unknown as Record<string, unknown>, confidence);
    results.push(pattern);
  }

  return results;
}

async function buildSimilarityClusters(userId: string, allTasks: Task[]): Promise<TaskPattern[]> {
  const clusters: { centroid: string[]; tasks: Task[] }[] = [];

  for (const task of allTasks) {
    const tokens = tokenize(task.activity);
    if (tokens.length === 0) continue;

    let bestCluster = -1;
    let bestSim = 0;

    for (let i = 0; i < clusters.length; i++) {
      const sim = jaccardSimilarity(tokens, clusters[i].centroid);
      if (sim > bestSim) { bestSim = sim; bestCluster = i; }
    }

    if (bestSim >= 0.3 && bestCluster >= 0) {
      clusters[bestCluster].tasks.push(task);
    } else {
      clusters.push({ centroid: tokens, tasks: [task] });
    }
  }

  const results: TaskPattern[] = [];

  for (const cluster of clusters) {
    if (cluster.tasks.length < 2) continue;

    const dates = cluster.tasks.filter(t => t.date).map(t => t.date).sort();
    const dayIndices = dates.map(d => new Date(d).getDay()).filter(d => !isNaN(d));
    const dayFreq = new Map<number, number>();
    for (const d of dayIndices) dayFreq.set(d, (dayFreq.get(d) || 0) + 1);

    let typicalDayIdx = 0;
    let maxFreq = 0;
    for (const [day, freq] of dayFreq) {
      if (freq > maxFreq) { maxFreq = freq; typicalDayIdx = day; }
    }

    const avgPriority = cluster.tasks.reduce((s, t) => s + t.priorityScore, 0) / cluster.tasks.length;
    const confidence = Math.min(100, Math.round(cluster.tasks.length * 12));

    const clusterData = {
      activities: cluster.tasks.slice(0, 5).map(t => t.activity),
      count: cluster.tasks.length,
      avgPriorityScore: Math.round(avgPriority * 10) / 10,
      typicalDayOfWeek: DAYS[typicalDayIdx],
      typicalDayIndex: typicalDayIdx,
      recentDates: dates.slice(-5),
      taskIds: cluster.tasks.slice(0, 5).map((t) => t.id),
    };

    const clusterKey = `cluster:${cluster.centroid.slice(0, 3).join("_")}`;
    const pattern = await upsertPattern(userId, "similarity_cluster", clusterKey, clusterData as unknown as Record<string, unknown>, confidence);
    results.push(pattern);
  }

  return results;
}

export function suggestDeadline(activity: string, patterns: TaskPattern[]): DeadlineSuggestion | null {
  const tokens = tokenize(activity);
  if (tokens.length === 0) return null;

  let bestMatch: { pattern: TaskPattern; similarity: number } | null = null;

  const recurrencePatterns = patterns.filter(p => p.patternType === "recurrence");
  for (const pattern of recurrencePatterns) {
    const patternTokens = tokenize(pattern.patternKey);
    const sim = jaccardSimilarity(tokens, patternTokens);
    if (sim >= 0.4 && (!bestMatch || sim > bestMatch.similarity)) {
      bestMatch = { pattern, similarity: sim };
    }
  }

  if (bestMatch) {
    const data = JSON.parse(bestMatch.pattern.data) as RecurrenceData;
    const nextDate = data.nextExpectedDate;
    const today = new Date();
    const suggested = new Date(nextDate);

    if (suggested < today) {
      const typicalDay = data.typicalDayIndex;
      const daysUntil = ((typicalDay - today.getDay()) + 7) % 7 || 7;
      suggested.setTime(today.getTime() + daysUntil * 24 * 60 * 60 * 1000);
    }

    return {
      suggestedDate: suggested.toISOString().split("T")[0],
      reason: `You usually do "${data.activity}" ${data.cadence.replace("_", " ")} on ${data.typicalDayOfWeek}s`,
      confidence: bestMatch.pattern.confidence,
      pattern: bestMatch.pattern.patternKey,
    };
  }

  const rhythmPatterns = patterns.filter(p => p.patternType === "deadline_rhythm");
  for (const pattern of rhythmPatterns) {
    const data = JSON.parse(pattern.data) as DeadlineRhythmData;
    const typicalDay = data.typicalDayIndex;
    const today = new Date();
    const daysUntil = ((typicalDay - today.getDay()) + 7) % 7 || 7;
    const suggested = new Date(today.getTime() + daysUntil * 24 * 60 * 60 * 1000);

    return {
      suggestedDate: suggested.toISOString().split("T")[0],
      reason: `${data.activity} are typically scheduled on ${data.typicalDayOfWeek}s (${data.cadence.replace("_", " ")})`,
      confidence: pattern.confidence,
      pattern: pattern.patternKey,
    };
  }

  const clusterPatterns = patterns.filter(p => p.patternType === "similarity_cluster");
  for (const pattern of clusterPatterns) {
    const keyTokens = pattern.patternKey.replace("cluster:", "").split("_");
    const sim = jaccardSimilarity(tokens, keyTokens);
    if (sim >= 0.3) {
      const data = JSON.parse(pattern.data);
      const typicalDay = data.typicalDayIndex;
      const today = new Date();
      const daysUntil = ((typicalDay - today.getDay()) + 7) % 7 || 7;
      const suggested = new Date(today.getTime() + daysUntil * 24 * 60 * 60 * 1000);

      return {
        suggestedDate: suggested.toISOString().split("T")[0],
        reason: `Similar tasks are usually done on ${data.typicalDayOfWeek}s`,
        confidence: Math.round(pattern.confidence * 0.7),
        pattern: pattern.patternKey,
      };
    }
  }

  return null;
}

export function getInsights(patterns: TaskPattern[]): PatternInsight[] {
  const insights: PatternInsight[] = [];

  const topics = patterns
    .filter(p => p.patternType === "topic" && p.occurrences >= 3)
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 5);

  for (const t of topics) {
    const data = JSON.parse(t.data) as TopicData;
    insights.push({
      type: "topic",
      title: `Frequent topic: "${data.topic}"`,
      description: `Appears in ${data.count} tasks. Average priority: ${data.avgPriorityScore}. Categories: ${data.classifications.join(", ")}.`,
      confidence: t.confidence,
      ...(Array.isArray(data.taskIds) && data.taskIds.length > 0 ? { taskIds: data.taskIds.slice(0, 5) } : {}),
      data,
    });
  }

  const recurrences = patterns
    .filter(p => p.patternType === "recurrence")
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 5);

  for (const r of recurrences) {
    const data = JSON.parse(r.data) as RecurrenceData;
    insights.push({
      type: "recurrence",
      title: `Recurring: "${data.activity}"`,
      description: `Done ${data.count} times, ${data.cadence.replace("_", " ")} (every ~${data.avgDays} days). Usually on ${data.typicalDayOfWeek}s. Next expected: ${data.nextExpectedDate}.`,
      confidence: r.confidence,
      ...(Array.isArray(data.taskIds) && data.taskIds.length > 0 ? { taskIds: data.taskIds.slice(0, 5) } : {}),
      data,
    });
  }

  const rhythms = patterns
    .filter(p => p.patternType === "deadline_rhythm")
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  for (const rh of rhythms) {
    const data = JSON.parse(rh.data) as DeadlineRhythmData;
    insights.push({
      type: "deadline_rhythm",
      title: `Rhythm: ${data.activity}`,
      description: `These tasks tend to land on ${data.typicalDayOfWeek}s, repeating ${data.cadence.replace("_", " ")} (~${data.avgDays} day cycle).`,
      confidence: rh.confidence,
      data,
    });
  }

  const clusters = patterns
    .filter(p => p.patternType === "similarity_cluster" && p.occurrences >= 2)
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 3);

  for (const c of clusters) {
    const data = JSON.parse(c.data);
    const taskIds: unknown = (data as { taskIds?: unknown }).taskIds;
    const taskIdList = Array.isArray(taskIds)
      ? (taskIds.filter((id) => typeof id === "string") as string[]).slice(0, 5)
      : [];
    insights.push({
      type: "similarity_cluster",
      title: `Task group (${data.count} similar tasks)`,
      description: `Examples: ${data.activities.slice(0, 3).join(", ")}. Usually done on ${data.typicalDayOfWeek}s.`,
      confidence: c.confidence,
      ...(taskIdList.length > 0 ? { taskIds: taskIdList } : {}),
      data,
    });
  }

  return insights.sort((a, b) => b.confidence - a.confidence);
}

export async function learnFromTask(userId: string, task: Task, allTasks: Task[]): Promise<void> {
  const tokens = tokenize(task.activity);
  for (const token of tokens) {
    const existing = allTasks.filter(t => t.id !== task.id && normalizeText(t.activity).includes(token));
    if (existing.length >= 1) {
      const topicData: TopicData = {
        topic: token,
        count: existing.length + 1,
        avgPriorityScore: Math.round(((existing.reduce((s, t) => s + t.priorityScore, 0) + task.priorityScore) / (existing.length + 1)) * 10) / 10,
        classifications: Array.from(new Set([...existing.map(t => t.classification), task.classification])),
        recentActivities: [task.activity, ...existing.slice(0, 2).map(t => t.activity)],
      };
      const confidence = Math.min(100, (existing.length + 1) * 10);
      await upsertPattern(userId, "topic", token, topicData as unknown as Record<string, unknown>, confidence);
    }
  }

  const similarTasks = allTasks.filter(t => {
    if (t.id === task.id) return false;
    return jaccardSimilarity(tokenize(t.activity), tokens) >= 0.5;
  });

  if (similarTasks.length >= 1) {
    const allInstances = [task, ...similarTasks].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const intervals: number[] = [];
    for (let i = 1; i < allInstances.length; i++) {
      intervals.push(daysBetween(allInstances[i - 1].date, allInstances[i].date));
    }
    const { cadence, avgDays } = detectCadence(intervals);
    const dayIndices = allInstances.map(t => new Date(t.date).getDay()).filter(d => !isNaN(d));
    const dayFreq = new Map<number, number>();
    for (const d of dayIndices) dayFreq.set(d, (dayFreq.get(d) || 0) + 1);
    let typicalDayIdx = 0;
    let maxFreq = 0;
    for (const [day, freq] of dayFreq) {
      if (freq > maxFreq) { maxFreq = freq; typicalDayIdx = day; }
    }

    const lastDate = allInstances[allInstances.length - 1].date;
    const nextExpected = new Date(lastDate);
    nextExpected.setDate(nextExpected.getDate() + (avgDays || 7));

    const recurrenceData: RecurrenceData = {
      activity: task.activity,
      count: allInstances.length,
      cadence,
      avgDays,
      typicalDayOfWeek: DAYS[typicalDayIdx],
      typicalDayIndex: typicalDayIdx,
      lastDate,
      nextExpectedDate: nextExpected.toISOString().split("T")[0],
    };

    const confidence = Math.min(100, allInstances.length * 15 + (cadence !== "unknown" ? 20 : 0));
    await upsertPattern(userId, "recurrence", normalizeText(task.activity), recurrenceData as unknown as Record<string, unknown>, confidence);
  }
}

type GroceryRepurchaseStats = {
  label: string;
  avgDays: number;
  confidence: number;
  lastPurchasedAt: Date;
  suggestedDate: Date;
};

function clampConfidence(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeGroceryLabel(raw: string): string {
  return normalizeText(raw)
    .replace(/\b(the|a|an|some|pack|bottle|box|fresh)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cadenceFromDates(dates: Date[]): GroceryRepurchaseStats | null {
  if (dates.length < 2) return null;
  const sorted = [...dates]
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (sorted.length < 2) return null;
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const days = Math.max(
      1,
      Math.round((sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24)),
    );
    intervals.push(days);
  }
  if (intervals.length === 0) return null;
  const avgDaysRaw = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  const avgDays = Math.max(1, Math.round(avgDaysRaw));
  const lastPurchasedAt = sorted[sorted.length - 1]!;
  const suggestedDate = new Date(lastPurchasedAt);
  suggestedDate.setDate(suggestedDate.getDate() + avgDays);
  const variance =
    intervals.length <= 1
      ? 0
      : intervals.reduce((s, v) => s + Math.pow(v - avgDaysRaw, 2), 0) / intervals.length;
  const stabilityPenalty = Math.min(35, Math.round(Math.sqrt(variance) * 8));
  const sampleBonus = Math.min(25, intervals.length * 6);
  const confidence = clampConfidence(55 + sampleBonus - stabilityPenalty);
  return {
    label: "",
    avgDays,
    confidence,
    lastPurchasedAt,
    suggestedDate,
  };
}

function mergeRepurchaseStats(
  left: GroceryRepurchaseStats,
  right: GroceryRepurchaseStats,
): GroceryRepurchaseStats {
  const leftWeight = Math.max(1, left.confidence);
  const rightWeight = Math.max(1, right.confidence);
  const avgDays = Math.max(
    1,
    Math.round((left.avgDays * leftWeight + right.avgDays * rightWeight) / (leftWeight + rightWeight)),
  );
  const lastPurchasedAt =
    left.lastPurchasedAt.getTime() >= right.lastPurchasedAt.getTime()
      ? left.lastPurchasedAt
      : right.lastPurchasedAt;
  const suggestedDate = new Date(lastPurchasedAt);
  suggestedDate.setDate(suggestedDate.getDate() + avgDays);
  return {
    label: left.label || right.label,
    avgDays,
    confidence: clampConfidence(Math.max(left.confidence, right.confidence) + 6),
    lastPurchasedAt,
    suggestedDate,
  };
}

export function inferGroceryRepurchaseSuggestions(input: {
  now?: Date;
  purchaseEvents: GroceryPurchaseEvent[];
  recurrencePatterns?: TaskPattern[];
  limit?: number;
}): GroceryRepurchaseSuggestion[] {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(20, input.limit ?? 6));
  const byLabel = new Map<string, Date[]>();
  for (const event of input.purchaseEvents) {
    const label = normalizeGroceryLabel(event.label);
    if (!label) continue;
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label)!.push(event.purchasedAt);
  }

  const historyStats = new Map<string, GroceryRepurchaseStats>();
  for (const [label, dates] of byLabel.entries()) {
    const stats = cadenceFromDates(dates);
    if (!stats) continue;
    stats.label = label;
    historyStats.set(label, stats);
  }

  const patternStats = new Map<string, GroceryRepurchaseStats>();
  for (const p of input.recurrencePatterns ?? []) {
    if (p.patternType !== "recurrence") continue;
    let data: Partial<RecurrenceData> | null = null;
    try {
      data = JSON.parse(p.data) as Partial<RecurrenceData>;
    } catch {
      data = null;
    }
    const label = normalizeGroceryLabel(data?.activity || p.patternKey || "");
    if (!label || !data?.lastDate) continue;
    const avgDays = Math.max(1, Math.round(Number(data.avgDays || 0) || 7));
    const lastPurchasedAt = new Date(String(data.lastDate));
    if (Number.isNaN(lastPurchasedAt.getTime())) continue;
    const suggestedDate = new Date(lastPurchasedAt);
    suggestedDate.setDate(suggestedDate.getDate() + avgDays);
    patternStats.set(label, {
      label,
      avgDays,
      confidence: clampConfidence(Math.round((p.confidence || 50) * 0.82)),
      lastPurchasedAt,
      suggestedDate,
    });
  }

  const keys = new Set([...historyStats.keys(), ...patternStats.keys()]);
  const rows: GroceryRepurchaseSuggestion[] = [];
  for (const key of keys) {
    const history = historyStats.get(key);
    const recurrence = patternStats.get(key);
    if (!history && !recurrence) continue;
    let merged: GroceryRepurchaseStats;
    let source: GroceryRepurchaseSuggestion["source"];
    if (history && recurrence) {
      merged = mergeRepurchaseStats(history, recurrence);
      source = "blended";
    } else if (history) {
      merged = history;
      source = "purchase_history";
    } else {
      merged = recurrence!;
      source = "task_patterns";
    }
    const daysUntil = Math.floor(
      (merged.suggestedDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysUntil > 7) continue;
    const urgencyBoost = daysUntil <= 0 ? 10 : daysUntil <= 2 ? 6 : 0;
    const confidence = clampConfidence(merged.confidence + urgencyBoost);
    if (confidence < 52) continue;
    const whenText =
      daysUntil <= 0 ? "now" : daysUntil === 1 ? "tomorrow" : `in ${daysUntil} days`;
    rows.push({
      item: key,
      suggestedDate: merged.suggestedDate.toISOString().split("T")[0],
      confidence,
      reason: `You usually repurchase ${key} every ~${merged.avgDays} days; next likely ${whenText}.`,
      avgDays: merged.avgDays,
      lastPurchasedAt: merged.lastPurchasedAt.toISOString().split("T")[0],
      source,
    });
  }

  rows.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.suggestedDate.localeCompare(b.suggestedDate);
  });
  return rows.slice(0, limit);
}
