import { createHash, randomInt, randomUUID } from "crypto";

export const IMPORT_OWNERSHIP_QUIZ_TTL_MS = 20 * 60 * 1000;

/** 1 task → 1 question, 2 → 2, 3+ → 3 (flat cap). No quiz when there are zero tasks. */
export function questionCountForImportTaskRows(taskRowCount: number): number {
  if (taskRowCount <= 0) return 0;
  return Math.min(taskRowCount, 3);
}

export type BundleTaskRow = Record<string, unknown>;

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

export function normalizeTaskRowsForFingerprint(rows: unknown[]): BundleTaskRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is BundleTaskRow => Boolean(r) && typeof r === "object" && !Array.isArray(r))
    .map((r) => {
      const keys = Object.keys(r).sort();
      const out: BundleTaskRow = {};
      for (const k of keys) {
        out[k] = r[k];
      }
      return out;
    })
    .sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")));
}

export function computeTasksFingerprint(taskRows: unknown[]): string {
  const normalized = normalizeTaskRowsForFingerprint(taskRows);
  return createHash("sha256").update(JSON.stringify(normalized), "utf8").digest("hex");
}

const GENERIC_ACTIVITY_DECOYS = [
  "Routine maintenance",
  "Follow-up from last week",
  "Unscheduled interruption",
  "Planning / admin block",
] as const;

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]!];
  }
}

function takeDistinctOthers(correct: string, candidates: string[], need: number): string[] {
  const seen = new Set<string>([correct.toLowerCase()]);
  const out: string[] = [];
  for (const c of candidates) {
    const t = c.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= need) break;
  }
  let g = 0;
  while (out.length < need) {
    const base = GENERIC_ACTIVITY_DECOYS[g % GENERIC_ACTIVITY_DECOYS.length];
    const candidate = `${base} (${g})`;
    const ck = candidate.toLowerCase();
    if (!seen.has(ck)) {
      seen.add(ck);
      out.push(candidate);
    }
    g++;
    if (g > 100) break;
  }
  return out;
}

export type OwnershipQuizQuestionPublic = {
  id: string;
  prompt: string;
  choices: string[];
};

export type OwnershipQuizQuestionSecret = OwnershipQuizQuestionPublic & {
  correctIndex: number;
};

function buildActivityQuestion(task: BundleTaskRow, others: BundleTaskRow[], questionId: string): OwnershipQuizQuestionSecret | null {
  const correct = str(task.activity);
  if (!correct) return null;

  const otherActivities = others.map((o) => str(o.activity)).filter(Boolean);
  const distractors = takeDistinctOthers(correct, otherActivities, 3);

  const choices = [correct, ...distractors.slice(0, 3)];
  if (choices.length < 4) return null;
  shuffleInPlace(choices);
  const correctIndex = choices.findIndex((c) => c === correct);
  if (correctIndex < 0) return null;

  const date = str(task.date) || "(no date)";
  const time = str(task.time) || "(no time)";
  const notes = truncate(str(task.notes), 120);
  const classification = str(task.classification) || "(none)";

  const prompt =
    `Which activity belongs to this task?\n\n` +
    `Date: ${date}\n` +
    `Time: ${time}\n` +
    `Classification: ${classification}\n` +
    (notes ? `Notes: ${notes}\n` : "");

  return { id: questionId, prompt, choices, correctIndex };
}

function buildNotesQuestion(task: BundleTaskRow, others: BundleTaskRow[], questionId: string): OwnershipQuizQuestionSecret | null {
  const correct = str(task.notes);
  if (correct.length < 4) return null;

  const otherNotes = others.map((o) => str(o.notes)).filter((n) => n.length >= 4);
  const distractors = takeDistinctOthers(correct, otherNotes, 3);

  const choices = [correct, ...distractors.slice(0, 3)];
  if (choices.length < 4) return null;
  shuffleInPlace(choices);
  const correctIndex = choices.findIndex((c) => c === correct);
  if (correctIndex < 0) return null;

  const date = str(task.date) || "(no date)";
  const time = str(task.time) || "(no time)";
  const activity = truncate(str(task.activity), 160);

  const prompt =
    `Which notes text belongs to this task?\n\n` +
    `Date: ${date}\n` +
    `Time: ${time}\n` +
    `Activity: ${activity}\n`;

  return { id: questionId, prompt, choices, correctIndex };
}

function buildClassificationQuestion(task: BundleTaskRow, others: BundleTaskRow[], questionId: string): OwnershipQuizQuestionSecret | null {
  const correct = str(task.classification);
  if (!correct) return null;

  const otherCls = others.map((o) => str(o.classification)).filter(Boolean);
  const distractors = takeDistinctOthers(correct, otherCls, 3);

  const choices = [correct, ...distractors.slice(0, 3)];
  if (choices.length < 4) return null;
  shuffleInPlace(choices);
  const correctIndex = choices.findIndex((c) => c === correct);
  if (correctIndex < 0) return null;

  const date = str(task.date) || "(no date)";
  const activity = truncate(str(task.activity), 160);

  const prompt =
    `Which classification belongs to this task?\n\n` +
    `Date: ${date}\n` +
    `Activity: ${activity}\n`;

  return { id: questionId, prompt, choices, correctIndex };
}

function buildTimeQuestion(task: BundleTaskRow, others: BundleTaskRow[], questionId: string): OwnershipQuizQuestionSecret | null {
  const correct = str(task.time);
  if (!correct) return null;

  const otherTimes = others.map((o) => str(o.time)).filter(Boolean);
  const distractors = takeDistinctOthers(correct, otherTimes, 3);

  const choices = [correct, ...distractors.slice(0, 3)];
  if (choices.length < 4) return null;
  shuffleInPlace(choices);
  const correctIndex = choices.findIndex((c) => c === correct);
  if (correctIndex < 0) return null;

  const date = str(task.date) || "(no date)";
  const activity = truncate(str(task.activity), 160);

  const prompt =
    `Which time value belongs to this task?\n\n` +
    `Date: ${date}\n` +
    `Activity: ${activity}\n`;

  return { id: questionId, prompt, choices, correctIndex };
}

export type BuildChallengeResult =
  | { ok: true; fingerprint: string; questions: OwnershipQuizQuestionSecret[] }
  | { ok: false; error: string };

/**
 * Builds up to three multiple-choice questions from task rows (1:1, 2:2, 3+:3 tasks sampled).
 */
export function buildImportOwnershipChallenge(taskRows: unknown[]): BuildChallengeResult {
  const rows = normalizeTaskRowsForFingerprint(taskRows);
  const fingerprint = computeTasksFingerprint(taskRows);
  const targetN = questionCountForImportTaskRows(rows.length);
  if (targetN === 0) {
    return { ok: true, fingerprint, questions: [] };
  }

  const pool = [...rows];
  shuffleInPlace(pool);

  const questions: OwnershipQuizQuestionSecret[] = [];
  const builders: Array<(t: BundleTaskRow, o: BundleTaskRow[]) => OwnershipQuizQuestionSecret | null> = [
    (t, o) => buildNotesQuestion(t, o, randomUUID()),
    (t, o) => buildClassificationQuestion(t, o, randomUUID()),
    (t, o) => buildTimeQuestion(t, o, randomUUID()),
    (t, o) => buildActivityQuestion(t, o, randomUUID()),
  ];

  let poolIdx = 0;
  while (questions.length < targetN && poolIdx < pool.length) {
    const task = pool[poolIdx++]!;
    const others = rows.filter((r) => r !== task);
    let q: OwnershipQuizQuestionSecret | null = null;
    const startB = questions.length % builders.length;
    for (let b = 0; b < builders.length; b++) {
      const fn = builders[(startB + b) % builders.length]!;
      q = fn(task, others);
      if (q) break;
    }
    if (!q) {
      q = buildActivityQuestion(task, others, randomUUID());
    }
    if (q) questions.push(q);
  }

  if (questions.length < targetN) {
    return {
      ok: false,
      error: "Could not build ownership verification questions from this backup (tasks may be too sparse).",
    };
  }

  return { ok: true, fingerprint, questions };
}

export function stripOwnershipQuizSecrets(questions: OwnershipQuizQuestionSecret[]): OwnershipQuizQuestionPublic[] {
  return questions.map(({ id, prompt, choices }) => ({ id, prompt, choices }));
}

export type OwnershipAnswer = { questionId: string; selectedIndex: number };

export type OwnershipQuizExpectedRow = { id: string; correctIndex: number; choiceCount: number };

/** Pass when score is at least 80% (integer-safe). */
export function gradeOwnershipQuiz(expected: OwnershipQuizExpectedRow[], answers: OwnershipAnswer[]): boolean {
  if (expected.length === 0) return true;
  if (!Array.isArray(answers) || answers.length !== expected.length) return false;

  const byId = new Map<string, number>();
  for (const a of answers) {
    if (!a || typeof a.questionId !== "string" || typeof a.selectedIndex !== "number") return false;
    if (!Number.isInteger(a.selectedIndex) || a.selectedIndex < 0) return false;
    byId.set(a.questionId, a.selectedIndex);
  }

  let correct = 0;
  for (const q of expected) {
    const sel = byId.get(q.id);
    if (sel === undefined) return false;
    if (sel >= q.choiceCount) return false;
    if (sel === q.correctIndex) correct++;
  }

  return correct * 100 >= expected.length * 80;
}

export function ownershipQuizExpectedFromSecrets(questions: OwnershipQuizQuestionSecret[]): OwnershipQuizExpectedRow[] {
  return questions.map((q) => ({
    id: q.id,
    correctIndex: q.correctIndex,
    choiceCount: q.choices.length,
  }));
}
