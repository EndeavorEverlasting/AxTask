import type { Task, TaskPattern } from "@shared/schema";
import { daysBetween } from "../lib/days";
import { upsertPattern, getPatterns, deleteStalePatterns, clearPatterns } from "../storage";

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
      entry.scores.push(task.priorityScore);
      entry.classifications.add(task.classification);
      if (entry.activities.length < 5) entry.activities.push(task.activity);
    }
  }

  const significantTopics = Array.from(topicMap.entries())
    .filter(([, data]) => data.count >= 3)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 50);

  const results: TaskPattern[] = [];
  for (const [topic, data] of Array.from(significantTopics)) {
    const confidence = Math.min(100, Math.round((data.count / allTasks.length) * 100 + data.count * 5));
    const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;

    const topicData: TopicData = {
      topic,
      count: data.count,
      avgPriorityScore: Math.round(avgScore * 10) / 10,
      classifications: Array.from(data.classifications),
      recentActivities: data.activities.slice(0, 3),
    };

    const pattern = await upsertPattern(userId, "topic", topic, topicData, confidence);
    results.push(pattern);
  }

  return results;
}

async function detectRecurrences(userId: string, allTasks: Task[]): Promise<TaskPattern[]> {
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

  const results: TaskPattern[] = [];

  for (const [key, group] of Array.from(groups.entries())) {
    if (group.length < 2) continue;

    const sorted = group
      .filter(t => t.date)
      .sort((a, b) => {
        const ta = parseYmdToUtcMs(a.date!);
        const tb = parseYmdToUtcMs(b.date!);
        return (ta ?? 0) - (tb ?? 0);
      });

    if (sorted.length < 2) continue;

    const intervals: number[] = [];
    const dayIndices: number[] = [];

    for (let i = 1; i < sorted.length; i++) {
      intervals.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    }

    for (const t of sorted) {
      const ms = t.date ? parseYmdToUtcMs(t.date) : null;
      if (ms !== null) dayIndices.push(new Date(ms).getUTCDay());
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
      activity: group[0].activity,
      count: group.length,
      cadence,
      avgDays,
      typicalDayOfWeek: DAYS[typicalDayIdx],
      typicalDayIndex: typicalDayIdx,
      lastDate,
      nextExpectedDate: nextExpectedStr,
    };

    const pattern = await upsertPattern(userId, "recurrence", key, recurrenceData, confidence);
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

  for (const [cls, group] of Array.from(classGroups.entries())) {
    if (group.length < 3) continue;

    const sorted = group.sort((a, b) => {
      const ta = parseYmdToUtcMs(a.date!);
      const tb = parseYmdToUtcMs(b.date!);
      return (ta ?? 0) - (tb ?? 0);
    });
    const intervals: number[] = [];
    const dayIndices: number[] = [];

    for (let i = 1; i < sorted.length; i++) {
      intervals.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    }

    for (const t of sorted) {
      const ms = t.date ? parseYmdToUtcMs(t.date) : null;
      if (ms !== null) dayIndices.push(new Date(ms).getUTCDay());
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
      dates: sorted.slice(-5).map(t => t.date),
    };

    const pattern = await upsertPattern(userId, "deadline_rhythm", `rhythm:${cls.toLowerCase()}`, rhythmData, confidence);
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
    const dayIndices = dates
      .map((d) => {
        const ms = parseYmdToUtcMs(d);
        return ms !== null ? new Date(ms).getUTCDay() : NaN;
      })
      .filter((d) => !Number.isNaN(d));
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

    const avgPriority = cluster.tasks.reduce((s, t) => s + t.priorityScore, 0) / cluster.tasks.length;
    const confidence = Math.min(100, Math.round(cluster.tasks.length * 12));

    const clusterData = {
      activities: cluster.tasks.slice(0, 5).map(t => t.activity),
      count: cluster.tasks.length,
      avgPriorityScore: Math.round(avgPriority * 10) / 10,
      typicalDayOfWeek: DAYS[typicalDayIdx],
      typicalDayIndex: typicalDayIdx,
      recentDates: dates.slice(-5),
    };

    const clusterKey = `cluster:${cluster.centroid.slice(0, 3).join("_")}`;
    const pattern = await upsertPattern(userId, "similarity_cluster", clusterKey, clusterData, confidence);
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
      const topicData: TopicData = {
        topic: token,
        count: existing.length + 1,
        avgPriorityScore: Math.round(((existing.reduce((s, t) => s + t.priorityScore, 0) + task.priorityScore) / (existing.length + 1)) * 10) / 10,
        classifications: Array.from(new Set([...existing.map(t => t.classification), task.classification])),
        recentActivities: [task.activity, ...existing.slice(0, 2).map(t => t.activity)],
      };
      const confidence = Math.min(100, (existing.length + 1) * 10);
      await upsertPattern(userId, "topic", token, topicData, confidence);
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
      await upsertPattern(userId, "recurrence", normalizeText(task.activity), recurrenceData, confidence);
    }
  }
}
