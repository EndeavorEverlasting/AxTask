import type { Task, TaskPattern } from "@shared/schema";
import { daysBetween } from "../lib/days";
import {
  upsertPattern,
  clearPatterns,
  replaceUserTaskPatterns,
  getPatterns,
  type TaskPatternRebuildRow,
} from "../storage";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function daysInMonthUtc(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/** Parse calendar YYYY-MM-DD at UTC midnight (avoids local-DST shifts). Rejects invalid calendar dates. */
function parseYmdToUtcMs(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return null;
  if (mo < 1 || mo > 12) return null;
  const dim = daysInMonthUtc(y, mo);
  if (d < 1 || d > dim) return null;
  const t = Date.UTC(y, mo - 1, d);
  return Number.isFinite(t) ? t : null;
}

function utcMsAddCalendarDays(ms: number, days: number): number {
  const d = new Date(ms);
  d.setUTCDate(d.getUTCDate() + days);
  return d.getTime();
}

function formatUtcYmd(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

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
  for (const w of Array.from(setA)) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
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
  data: TopicData | RecurrenceData | DeadlineRhythmData | Record<string, unknown>;
}

export interface DeadlineSuggestion {
  suggestedDate: string;
  reason: string;
  confidence: number;
  pattern: string;
}

const MAX_TASKS_FOR_ANALYSIS = 500;

function parsePatternJson<T>(raw: string, patternId: string, patternType: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(
      `[pattern-engine] Malformed pattern JSON (id=${patternId}, type=${patternType}):`,
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

export async function analyzeTaskHistory(userId: string, allTasks: Task[]): Promise<TaskPattern[]> {
  if (allTasks.length < 3) {
    await clearPatterns(userId);
    return [];
  }

  const sorted = [...allTasks].sort((a, b) => {
    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return db - da;
  });
  const recentTasks = sorted.slice(0, MAX_TASKS_FOR_ANALYSIS);

  const rows: TaskPatternRebuildRow[] = [
    ...collectTopicPatternRows(recentTasks),
    ...collectRecurrencePatternRows(recentTasks),
    ...collectDeadlineRhythmPatternRows(recentTasks),
    ...collectSimilarityClusterPatternRows(recentTasks),
  ];

  await replaceUserTaskPatterns(userId, rows);
  return getPatterns(userId);
}

function collectTopicPatternRows(allTasks: Task[]): TaskPatternRebuildRow[] {
  const topicMap = new Map<string, { count: number; scores: number[]; classifications: Set<string>; activities: string[] }>();

  for (const task of allTasks) {
    const tokens = tokenize(task.activity);
    const bigrams: string[] = [];
    for (let i = 0; i < tokens.length - 1; i++) {
      bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
    }

    const phrases = [...new Set([...tokens, ...bigrams])];
    for (const phrase of phrases) {
      if (!topicMap.has(phrase)) {
        topicMap.set(phrase, { count: 0, scores: [], classifications: new Set(), activities: [] });
      }
      const entry = topicMap.get(phrase)!;
      entry.count++;
      const ps = task.priorityScore;
      if (typeof ps === "number" && Number.isFinite(ps)) {
        entry.scores.push(ps);
      }
      const cls = task.classification;
      if (typeof cls === "string" && cls.trim() !== "") {
        entry.classifications.add(cls);
      }
      const act = task.activity;
      if (typeof act === "string" && act.trim() !== "" && entry.activities.length < 5) {
        entry.activities.push(act);
      }
    }
  }

  const significantTopics = Array.from(topicMap.entries())
    .filter(([, data]) => data.count >= 3)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 50);

  const results: TaskPatternRebuildRow[] = [];
  for (const [topic, data] of Array.from(significantTopics)) {
    const confidence = Math.min(100, Math.round((data.count / allTasks.length) * 100 + data.count * 5));
    const avgScore =
      data.scores.length > 0 ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length : 0;

    const topicData: TopicData = {
      topic,
      count: data.count,
      avgPriorityScore: Math.round(avgScore * 10) / 10,
      classifications: Array.from(data.classifications),
      recentActivities: data.activities.slice(0, 3),
    };

    results.push({
      patternType: "topic",
      patternKey: topic,
      data: topicData,
      confidence,
      occurrences: data.count,
    });
  }

  return results;
}

function collectRecurrencePatternRows(allTasks: Task[]): TaskPatternRebuildRow[] {
  const groups = new Map<string, Task[]>();

  for (const task of allTasks) {
    const normalized = normalizeText(task.activity);
    let matched = false;

    for (const [key, group] of Array.from(groups.entries())) {
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

  const results: TaskPatternRebuildRow[] = [];

  for (const [key, group] of Array.from(groups.entries())) {
    if (group.length < 2) continue;

    const dated = group
      .map((t) => {
        const ms = t.date ? parseYmdToUtcMs(t.date) : null;
        return ms !== null ? { task: t, ms } : null;
      })
      .filter((x): x is { task: Task; ms: number } => x != null)
      .sort((a, b) => a.ms - b.ms);

    if (dated.length < 2) continue;

    const sorted = dated.map((d) => d.task);

    const intervals: number[] = [];
    const dayIndices: number[] = [];

    for (let i = 1; i < dated.length; i++) {
      const d0 = formatUtcYmd(dated[i - 1].ms);
      const d1 = formatUtcYmd(dated[i].ms);
      intervals.push(daysBetween(d0, d1));
    }

    for (const { ms } of dated) {
      dayIndices.push(new Date(ms).getUTCDay());
    }

    const { cadence, avgDays } = detectCadence(intervals);

    const dayFreq = new Map<number, number>();
    for (const d of Array.from(dayIndices)) dayFreq.set(d, (dayFreq.get(d) || 0) + 1);
    let typicalDayIdx = 0;
    let maxDayFreq = 0;
    for (const [day, freq] of Array.from(dayFreq.entries())) {
      if (freq > maxDayFreq) { maxDayFreq = freq; typicalDayIdx = day; }
    }

    const lastDate = sorted[sorted.length - 1].date;
    const lastMs = parseYmdToUtcMs(lastDate);
    if (lastMs === null) continue;
    const nextMs = utcMsAddCalendarDays(lastMs, avgDays || 7);
    const nextExpectedStr = formatUtcYmd(nextMs);

    const confidence = Math.min(100, Math.round(group.length * 15 + (cadence !== "unknown" ? 20 : 0)));

    const recurrenceData: RecurrenceData = {
      activity:
        group.map((t) => t.activity).find((a) => typeof a === "string" && a.trim() !== "")?.trim() || "Task",
      count: group.length,
      cadence,
      avgDays,
      typicalDayOfWeek: DAYS[typicalDayIdx],
      typicalDayIndex: typicalDayIdx,
      lastDate,
      nextExpectedDate: nextExpectedStr,
    };

    results.push({
      patternType: "recurrence",
      patternKey: key,
      data: recurrenceData,
      confidence,
      occurrences: group.length,
    });
  }

  return results;
}

function collectDeadlineRhythmPatternRows(allTasks: Task[]): TaskPatternRebuildRow[] {
  const classGroups = new Map<string, Task[]>();

  for (const task of allTasks) {
    if (!task.date) continue;
    const cls = task.classification || "General";
    if (!classGroups.has(cls)) classGroups.set(cls, []);
    classGroups.get(cls)!.push(task);
  }

  const results: TaskPatternRebuildRow[] = [];

  for (const [cls, group] of Array.from(classGroups.entries())) {
    if (group.length < 3) continue;

    const dated = group
      .map((t) => {
        const ms = t.date ? parseYmdToUtcMs(t.date) : null;
        return ms !== null ? { task: t, ms } : null;
      })
      .filter((x): x is { task: Task; ms: number } => x != null)
      .sort((a, b) => a.ms - b.ms);

    if (dated.length < 3) continue;

    const sorted = dated.map((d) => d.task);
    const intervals: number[] = [];
    const dayIndices: number[] = [];

    for (let i = 1; i < dated.length; i++) {
      const d0 = formatUtcYmd(dated[i - 1].ms);
      const d1 = formatUtcYmd(dated[i].ms);
      intervals.push(daysBetween(d0, d1));
    }

    for (const { ms } of dated) {
      dayIndices.push(new Date(ms).getUTCDay());
    }

    if (intervals.length === 0) continue;

    const { cadence, avgDays } = detectCadence(intervals);
    if (cadence === "unknown" || cadence === "occasional") continue;

    const dayFreq = new Map<number, number>();
    for (const d of Array.from(dayIndices)) dayFreq.set(d, (dayFreq.get(d) || 0) + 1);
    let typicalDayIdx = 0;
    let maxDayFreq = 0;
    for (const [day, freq] of Array.from(dayFreq.entries())) {
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
      dates: sorted.slice(-5).map(t => t.date!).filter(Boolean) as string[],
    };

    results.push({
      patternType: "deadline_rhythm",
      patternKey: `rhythm:${cls.toLowerCase()}`,
      data: rhythmData,
      confidence,
      occurrences: group.length,
    });
  }

  return results;
}

function collectSimilarityClusterPatternRows(allTasks: Task[]): TaskPatternRebuildRow[] {
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

  const results: TaskPatternRebuildRow[] = [];

  for (const cluster of clusters) {
    if (cluster.tasks.length < 2) continue;

    const datedDates = cluster.tasks
      .map((t) => t.date)
      .filter((d): d is string => d != null && d !== "")
      .map((d) => {
        const ms = parseYmdToUtcMs(d);
        return ms !== null ? { d, ms } : null;
      })
      .filter((x): x is { d: string; ms: number } => x != null)
      .sort((a, b) => a.ms - b.ms);
    const dates = datedDates.map((x) => x.d);
    const dayIndices = datedDates.map((x) => new Date(x.ms).getUTCDay());
    const dayFreq = new Map<number, number>();
    for (const d of Array.from(dayIndices)) dayFreq.set(d, (dayFreq.get(d) || 0) + 1);

    if (dayFreq.size === 0) {
      continue;
    }

    let typicalDayIdx = 0;
    let maxFreq = 0;
    for (const [day, freq] of Array.from(dayFreq.entries())) {
      if (freq > maxFreq) { maxFreq = freq; typicalDayIdx = day; }
    }

    const finiteScores = cluster.tasks
      .map((t) => t.priorityScore)
      .filter((s): s is number => typeof s === "number" && Number.isFinite(s));
    const avgPriority = finiteScores.length > 0 ? finiteScores.reduce((s, x) => s + x, 0) / finiteScores.length : 0;
    const confidence = Math.min(100, Math.round(cluster.tasks.length * 12));

    const clusterData = {
      activities: cluster.tasks
        .slice(0, 5)
        .map((t) => t.activity)
        .filter((a): a is string => typeof a === "string" && a.trim() !== ""),
      count: cluster.tasks.length,
      avgPriorityScore: Math.round(avgPriority * 10) / 10,
      typicalDayOfWeek: DAYS[typicalDayIdx],
      typicalDayIndex: typicalDayIdx,
      recentDates: dates.slice(-5),
    };

    const clusterKey = `cluster:${cluster.centroid.slice(0, 3).join("_")}`;
    results.push({
      patternType: "similarity_cluster",
      patternKey: clusterKey,
      data: clusterData,
      confidence,
      occurrences: cluster.tasks.length,
    });
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
    try {
      const data = JSON.parse(bestMatch.pattern.data) as RecurrenceData;
      const cad = (data.cadence || "").toLowerCase();
      const fallbackInterval =
        cad.includes("daily") ? 1
        : cad.includes("biweekly") ? 14
        : cad.includes("weekly") ? 7
        : cad.includes("monthly") ? 30
        : 7;
      const intervalDays = Math.max(
        1,
        Math.round(
          typeof data.avgDays === "number" && Number.isFinite(data.avgDays) && data.avgDays > 0
            ? data.avgDays
            : fallbackInterval,
        ),
      );

      const nowClock = new Date();
      const todayUtcMs = Date.UTC(
        nowClock.getUTCFullYear(),
        nowClock.getUTCMonth(),
        nowClock.getUTCDate(),
      );

      const nextExpectedMs = parseYmdToUtcMs(data.nextExpectedDate);
      if (nextExpectedMs === null) throw new Error("invalid nextExpectedDate");
      let suggestedMs = nextExpectedMs;

      if (suggestedMs < todayUtcMs) {
        const weeklyLike = intervalDays >= 6 && intervalDays <= 8;
        if (weeklyLike && typeof data.typicalDayIndex === "number") {
          const todayDow = new Date(todayUtcMs).getUTCDay();
          let daysUntil = (data.typicalDayIndex - todayDow + 7) % 7;
          if (daysUntil === 0) daysUntil = 7;
          suggestedMs = utcMsAddCalendarDays(todayUtcMs, daysUntil);
        } else {
          const safeInterval = Math.max(1, intervalDays);
          let s = nextExpectedMs;
          const maxIterations = 4000;
          let iter = 0;
          while (s < todayUtcMs && iter < maxIterations) {
            s = utcMsAddCalendarDays(s, safeInterval);
            iter += 1;
          }
          if (iter >= maxIterations) {
            console.error("[pattern-engine] suggestDeadline: max iterations advancing recurrence date");
          }
          suggestedMs = s;
        }
      }

      return {
        suggestedDate: formatUtcYmd(suggestedMs),
        reason: `You usually do "${data.activity}" ${data.cadence.replace("_", " ")} on ${data.typicalDayOfWeek}s`,
        confidence: bestMatch.pattern.confidence,
        pattern: bestMatch.pattern.patternKey,
      };
    } catch (err) {
      console.warn("[pattern-engine] Invalid recurrence pattern JSON, skipping:", err);
    }
  }

  const rhythmPatterns = patterns.filter(p => p.patternType === "deadline_rhythm");
  let bestRhythm: DeadlineSuggestion | null = null;
  for (const pattern of rhythmPatterns) {
    try {
      const data = JSON.parse(pattern.data) as DeadlineRhythmData;
      const keyMatch = /^rhythm:(.+)$/.exec(pattern.patternKey);
      const clsFromKey = keyMatch ? keyMatch[1].replace(/_/g, " ") : "";
      const actNorm = normalizeText(activity);
      const dataActNorm = normalizeText(data.activity);
      const tokenSimData = jaccardSimilarity(tokens, tokenize(data.activity));
      const tokenSimKey = clsFromKey ? jaccardSimilarity(tokens, tokenize(clsFromKey)) : 0;
      const clsNorm = normalizeText(clsFromKey);
      const firstActToken = actNorm.split(/\s+/).find(Boolean) ?? "";
      const matchesActivity =
        actNorm === dataActNorm ||
        tokenSimData >= 0.35 ||
        tokenSimKey >= 0.25 ||
        (clsNorm.length > 0 && (actNorm.includes(clsNorm) || clsNorm.includes(firstActToken)));
      if (!matchesActivity) continue;

      const typicalDay = data.typicalDayIndex;
      const nowClock = new Date();
      const todayUtcMs = Date.UTC(
        nowClock.getUTCFullYear(),
        nowClock.getUTCMonth(),
        nowClock.getUTCDate(),
      );
      const todayDow = new Date(todayUtcMs).getUTCDay();
      const daysUntil = ((typicalDay - todayDow) + 7) % 7 || 7;
      const suggestedMs = utcMsAddCalendarDays(todayUtcMs, daysUntil);

      const suggestion: DeadlineSuggestion = {
        suggestedDate: formatUtcYmd(suggestedMs),
        reason: `${data.activity} are typically scheduled on ${data.typicalDayOfWeek}s (${data.cadence.replace("_", " ")})`,
        confidence: pattern.confidence,
        pattern: pattern.patternKey,
      };
      if (!bestRhythm || suggestion.confidence > bestRhythm.confidence) {
        bestRhythm = suggestion;
      }
    } catch (err) {
      console.warn("[pattern-engine] Invalid deadline_rhythm pattern JSON, skipping:", err);
    }
  }
  if (bestRhythm) {
    return bestRhythm;
  }

  const clusterPatterns = patterns.filter(p => p.patternType === "similarity_cluster");
  for (const pattern of clusterPatterns) {
    const keyTokens = pattern.patternKey.replace("cluster:", "").split("_");
    const sim = jaccardSimilarity(tokens, keyTokens);
    if (sim >= 0.3) {
      try {
        const data = JSON.parse(pattern.data) as { typicalDayIndex: number; typicalDayOfWeek: string };
        const typicalDay = data.typicalDayIndex;
        const nowClock = new Date();
        const todayUtcMs = Date.UTC(
          nowClock.getUTCFullYear(),
          nowClock.getUTCMonth(),
          nowClock.getUTCDate(),
        );
        const todayDow = new Date(todayUtcMs).getUTCDay();
        const daysUntil = ((typicalDay - todayDow) + 7) % 7 || 7;
        const suggestedMs = utcMsAddCalendarDays(todayUtcMs, daysUntil);

        return {
          suggestedDate: formatUtcYmd(suggestedMs),
          reason: `Similar tasks are usually done on ${data.typicalDayOfWeek}s`,
          confidence: Math.round(pattern.confidence * 0.7),
          pattern: pattern.patternKey,
        };
      } catch (err) {
        console.warn("[pattern-engine] Invalid similarity_cluster pattern JSON, skipping:", err);
      }
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
    const data = parsePatternJson<TopicData>(t.data, t.id, t.patternType);
    if (!data) continue;
    insights.push({
      type: "topic",
      title: `Frequent topic: "${data.topic}"`,
      description: `Appears in ${data.count} tasks. Average priority: ${data.avgPriorityScore}. Categories: ${data.classifications.join(", ")}.`,
      confidence: t.confidence,
      data,
    });
  }

  const recurrences = patterns
    .filter(p => p.patternType === "recurrence")
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 5);

  for (const r of recurrences) {
    const data = parsePatternJson<RecurrenceData>(r.data, r.id, r.patternType);
    if (!data) continue;
    insights.push({
      type: "recurrence",
      title: `Recurring: "${data.activity}"`,
      description: `Done ${data.count} times, ${data.cadence.replace("_", " ")} (every ~${data.avgDays} days). Usually on ${data.typicalDayOfWeek}s. Next expected: ${data.nextExpectedDate}.`,
      confidence: r.confidence,
      data,
    });
  }

  const rhythms = patterns
    .filter(p => p.patternType === "deadline_rhythm")
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  for (const rh of rhythms) {
    const data = parsePatternJson<DeadlineRhythmData>(rh.data, rh.id, rh.patternType);
    if (!data) continue;
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
    const data = parsePatternJson<Record<string, unknown>>(c.data, c.id, c.patternType);
    if (!data || typeof data !== "object") continue;
    const activities = data.activities;
    const typicalDayOfWeek = data.typicalDayOfWeek;
    const count = data.count;
    if (!Array.isArray(activities) || typeof typicalDayOfWeek !== "string") continue;
    const countLabel = typeof count === "number" ? count : activities.length;
    insights.push({
      type: "similarity_cluster",
      title: `Task group (${countLabel} similar tasks)`,
      description: `Examples: ${activities.slice(0, 3).map(String).join(", ")}. Usually done on ${typicalDayOfWeek}s.`,
      confidence: c.confidence,
      data,
    });
  }

  return insights.sort((a, b) => b.confidence - a.confidence);
}

export async function learnFromTask(userId: string, task: Task, allTasks: Task[]): Promise<void> {
  const tokens = tokenize(task.activity);
  for (const token of tokens) {
    const existing = allTasks.filter(
      (t) => t.id !== task.id && tokenize(t.activity).includes(token),
    );
    if (existing.length >= 1) {
      const finiteScores = [task, ...existing]
        .map((t) => t.priorityScore)
        .filter((s): s is number => typeof s === "number" && Number.isFinite(s));
      const avgPriorityScore =
        finiteScores.length > 0
          ? Math.round((finiteScores.reduce((s, x) => s + x, 0) / finiteScores.length) * 10) / 10
          : 0;
      const classSet = new Set<string>();
      for (const t of [...existing, task]) {
        const c = t.classification;
        if (typeof c === "string" && c.trim() !== "") classSet.add(c);
      }
      const recentActivities = [task.activity, ...existing.slice(0, 2).map((t) => t.activity)].filter(
        (a): a is string => typeof a === "string" && a.trim() !== "",
      );
      const topicData: TopicData = {
        topic: token,
        count: existing.length + 1,
        avgPriorityScore,
        classifications: Array.from(classSet),
        recentActivities,
      };
      const confidence = Math.min(100, (existing.length + 1) * 10);
      await upsertPattern(userId, "topic", token, topicData, confidence, topicData.count);
    }
  }

  const similarTasks = allTasks.filter(t => {
    if (t.id === task.id) return false;
    return jaccardSimilarity(tokenize(t.activity), tokens) >= 0.5;
  });

  if (similarTasks.length >= 1) {
    const withValidDates = [task, ...similarTasks].filter((t) => {
      const ms = t.date ? parseYmdToUtcMs(t.date) : null;
      return ms !== null;
    });
    if (withValidDates.length >= 2) {
      const allInstances = withValidDates.sort((a, b) => {
        const ma = parseYmdToUtcMs(a.date!)!;
        const mb = parseYmdToUtcMs(b.date!)!;
        return ma - mb;
      });
      const intervals: number[] = [];
      for (let i = 1; i < allInstances.length; i++) {
        intervals.push(daysBetween(allInstances[i - 1].date, allInstances[i].date));
      }
      const { cadence, avgDays } = detectCadence(intervals);
      const dayIndices = allInstances
        .map((t) => {
          const ms = parseYmdToUtcMs(t.date!)!;
          return new Date(ms).getUTCDay();
        })
        .filter((d) => !isNaN(d));
      const dayFreq = new Map<number, number>();
      for (const d of Array.from(dayIndices)) dayFreq.set(d, (dayFreq.get(d) || 0) + 1);
      let typicalDayIdx = 0;
      let maxFreq = 0;
      for (const [day, freq] of Array.from(dayFreq.entries())) {
        if (freq > maxFreq) { maxFreq = freq; typicalDayIdx = day; }
      }

      const lastDate = allInstances[allInstances.length - 1].date;
      const lastMs = parseYmdToUtcMs(lastDate)!;
      const nextMs = utcMsAddCalendarDays(lastMs, avgDays || 7);
      const nextExpectedDate = formatUtcYmd(nextMs);

      const recurrenceData: RecurrenceData = {
        activity: task.activity,
        count: allInstances.length,
        cadence,
        avgDays,
        typicalDayOfWeek: DAYS[typicalDayIdx],
        typicalDayIndex: typicalDayIdx,
        lastDate,
        nextExpectedDate,
      };

      const confidence = Math.min(100, allInstances.length * 15 + (cadence !== "unknown" ? 20 : 0));
      await upsertPattern(
        userId,
        "recurrence",
        normalizeText(task.activity),
        recurrenceData,
        confidence,
        recurrenceData.count,
      );
    }
  }
}
