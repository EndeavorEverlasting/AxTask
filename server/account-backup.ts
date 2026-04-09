import { createHash, randomUUID } from "crypto";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { insertTaskSchema, type InsertTask, userBadges } from "@shared/schema";
import { db } from "./db";
import {
  appendSecurityEvent,
  assertCanCreateTasks,
  getOrCreateWallet,
  getUserBadges,
  hasImportFingerprint,
  recordImportFingerprint,
  storage,
} from "./storage";
import { computeTaskFingerprint } from "./task-fingerprint";

const SCHEMA_VERSION = 1;

export type UserExportBundle = {
  metadata: {
    exportMode: "user";
    exportedAt: string;
    schemaVersion: number;
    tableCounts: Record<string, number>;
    integrityNote?: string;
  };
  data: {
    tasks: InsertTask[];
    walletSnapshot?: {
      balance: number;
      lifetimeEarned: number;
      currentStreak: number;
      longestStreak: number;
      lastCompletionDate: string | null;
    };
    badges?: { badgeId: string }[];
  };
};

const bundleSchema = z.object({
  metadata: z.object({
    exportMode: z.literal("user"),
    exportedAt: z.string().optional(),
    schemaVersion: z.number().optional(),
    tableCounts: z.record(z.number()).optional(),
    integrityNote: z.string().optional(),
  }),
  data: z.object({
    tasks: z.array(z.record(z.unknown())).default([]),
    walletSnapshot: z.record(z.unknown()).optional(),
    badges: z.array(z.object({ badgeId: z.string().min(1) })).optional(),
  }),
});

export function computeBundleTasksFingerprint(taskRows: InsertTask[]): string {
  const fps = taskRows.map((t) => computeTaskFingerprint(t)).sort();
  return createHash("sha256").update(fps.join("|")).digest("hex");
}

function shuffleWithSeed<T>(items: T[], seedHex: string): T[] {
  const arr = [...items];
  let h = seedHex;
  for (let i = arr.length - 1; i > 0; i--) {
    h = createHash("sha256").update(h + String(i)).digest("hex");
    const j = parseInt(h.slice(0, 8), 16) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickQuestionTaskIndices(nTasks: number, seed: string, count: number): number[] {
  if (nTasks === 0) return [];
  const want = Math.min(count, nTasks);
  const indices: number[] = [];
  let h = seed;
  let guard = 0;
  while (indices.length < want && guard < nTasks * 4) {
    guard++;
    h = createHash("sha256").update(h + String(indices.length)).digest("hex");
    const idx = parseInt(h.slice(0, 8), 16) % nTasks;
    if (!indices.includes(idx)) indices.push(idx);
  }
  let k = 0;
  while (indices.length < want && k < nTasks) {
    if (!indices.includes(k)) indices.push(k);
    k++;
  }
  return indices.slice(0, want);
}

export async function buildUserExportBundle(userId: string): Promise<UserExportBundle> {
  const [taskRows, wallet, badgeRows] = await Promise.all([
    storage.getTasks(userId),
    getOrCreateWallet(userId),
    getUserBadges(userId),
  ]);

  const tasks: InsertTask[] = taskRows.map((t) => {
    const raw = {
      date: t.date,
      time: t.time ?? undefined,
      activity: t.activity,
      notes: t.notes ?? "",
      urgency: t.urgency ?? undefined,
      impact: t.impact ?? undefined,
      effort: t.effort ?? undefined,
      prerequisites: t.prerequisites ?? "",
      recurrence: (t.recurrence || "none") as InsertTask["recurrence"],
      status: (t.status || "pending") as InsertTask["status"],
      visibility: (t.visibility || "private") as InsertTask["visibility"],
      communityShowNotes: t.communityShowNotes ?? false,
    };
    return insertTaskSchema.parse(raw);
  });

  const tableCounts: Record<string, number> = {
    tasks: tasks.length,
    badges: badgeRows.length,
  };

  return {
    metadata: {
      exportMode: "user",
      exportedAt: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
      tableCounts,
      integrityNote:
        "Wallet balances and coin history are not restored from this file on import. Tasks are merged with fingerprint dedupe. Badges are merged when missing.",
    },
    data: {
      tasks,
      walletSnapshot: {
        balance: wallet.balance,
        lifetimeEarned: wallet.lifetimeEarned,
        currentStreak: wallet.currentStreak,
        longestStreak: wallet.longestStreak,
        lastCompletionDate: wallet.lastCompletionDate ?? null,
      },
      badges: badgeRows.map((b) => ({ badgeId: b.badgeId })),
    },
  };
}

export type AccountImportChallengeResponse = {
  ownershipQuizRequired: boolean;
  tasksFingerprint: string;
  questionCount: number;
  questions: { id: string; prompt: string; choices: string[] }[];
  message?: string;
};

function buildOwnershipQuestions(tasks: InsertTask[], tasksFingerprint: string) {
  const seed = createHash("sha256").update(`${tasksFingerprint}:ownership-quiz:v1`).digest("hex");
  const idxs = pickQuestionTaskIndices(tasks.length, seed, Math.min(3, tasks.length));
  const activities = tasks.map((t) => (t.activity || "").trim() || "(empty activity)");
  const wrongPool = Array.from(new Set(activities)).filter((a) => a.length > 0);

  const questions: AccountImportChallengeResponse["questions"] = [];
  for (let q = 0; q < idxs.length; q++) {
    const ti = idxs[q];
    const correct = activities[ti];
    const others = wrongPool.filter((a) => a !== correct).slice(0, 12);
    const distractors = shuffleWithSeed(others, seed + `:d${q}`).slice(0, 3);
    while (distractors.length < 3) {
      distractors.push(`Other task ${distractors.length + 1} (${ti}:${q})`);
    }
    const choices = shuffleWithSeed([correct, ...distractors.slice(0, 3)], seed + `:c${q}`);
    questions.push({
      id: `ownership-q-${q}`,
      prompt: "Which activity belongs to a task in this backup? (ownership check)",
      choices,
    });
  }
  return questions;
}

export function buildImportChallenge(bundle: unknown): AccountImportChallengeResponse {
  const parsed = bundleSchema.safeParse(bundle);
  if (!parsed.success) {
    return {
      ownershipQuizRequired: false,
      tasksFingerprint: "",
      questionCount: 0,
      questions: [],
      message: "Invalid backup format",
    };
  }

  const rawTasks = parsed.data.data.tasks;
  const tasks: InsertTask[] = [];
  for (let i = 0; i < rawTasks.length; i++) {
    try {
      tasks.push(insertTaskSchema.parse(rawTasks[i]));
    } catch {
      return {
        ownershipQuizRequired: false,
        tasksFingerprint: "",
        questionCount: 0,
        questions: [],
        message: `Invalid task at index ${i}`,
      };
    }
  }

  const tasksFingerprint = computeBundleTasksFingerprint(tasks);
  if (tasks.length === 0) {
    return {
      ownershipQuizRequired: false,
      tasksFingerprint,
      questionCount: 0,
      questions: [],
    };
  }

  const questions = buildOwnershipQuestions(tasks, tasksFingerprint);

  return {
    ownershipQuizRequired: true,
    tasksFingerprint,
    questionCount: questions.length,
    questions,
  };
}

function verifyOwnershipQuiz(
  bundleTasks: InsertTask[],
  answers: { questionId: string; selectedIndex: number }[],
  tasksFingerprint: string,
): { ok: boolean; message?: string } {
  const questions = buildOwnershipQuestions(bundleTasks, tasksFingerprint);
  if (answers.length < questions.length) {
    return { ok: false, message: "Incomplete ownership verification" };
  }
  const seed = createHash("sha256").update(`${tasksFingerprint}:ownership-quiz:v1`).digest("hex");
  const idxs = pickQuestionTaskIndices(bundleTasks.length, seed, Math.min(3, bundleTasks.length));
  const activities = bundleTasks.map((t) => (t.activity || "").trim() || "(empty activity)");

  for (let q = 0; q < questions.length; q++) {
    const meta = questions[q];
    const answer = answers.find((a) => a.questionId === meta.id);
    if (!answer || answer.selectedIndex < 0 || answer.selectedIndex >= meta.choices.length) {
      return { ok: false, message: "Incomplete ownership verification" };
    }
    const ti = idxs[q];
    const correct = activities[ti];
    if (meta.choices[answer.selectedIndex] !== correct) {
      return { ok: false, message: "Incorrect answer — this backup may not be yours" };
    }
  }
  return { ok: true };
}

export type AccountImportApiResult = {
  success: boolean;
  dryRun: boolean;
  inserted: Record<string, number>;
  skipped: Record<string, number>;
  conflicts: Record<string, number>;
  errors?: { table: string; field: string; message: string }[];
  warnings?: { table: string; field: string; message: string }[];
};

export async function runAccountImport(params: {
  userId: string;
  bundle: unknown;
  dryRun: boolean;
  importOwnershipAnswers?: { questionId: string; selectedIndex: number }[];
  ipAddress?: string;
  userAgent?: string | undefined;
}): Promise<AccountImportApiResult> {
  const errors: AccountImportApiResult["errors"] = [];
  const warnings: AccountImportApiResult["warnings"] = [
    {
      table: "wallets",
      field: "balance",
      message: "Wallet balances from the backup are never applied automatically. Coins stay ledger-safe.",
    },
  ];

  const parsed = bundleSchema.safeParse(params.bundle);
  if (!parsed.success) {
    return {
      success: false,
      dryRun: params.dryRun,
      inserted: {},
      skipped: {},
      conflicts: {},
      errors: [{ table: "bundle", field: "root", message: "Invalid backup JSON shape" }],
    };
  }

  const rawTasks = parsed.data.data.tasks;
  const tasks: InsertTask[] = [];
  for (let i = 0; i < rawTasks.length; i++) {
    try {
      tasks.push(insertTaskSchema.parse(rawTasks[i]));
    } catch (e) {
      errors.push({
        table: "tasks",
        field: String(i),
        message: e instanceof Error ? e.message : "Validation failed",
      });
    }
  }
  if (errors.length > 0) {
    return {
      success: false,
      dryRun: params.dryRun,
      inserted: {},
      skipped: {},
      conflicts: {},
      errors,
    };
  }

  const fp = computeBundleTasksFingerprint(tasks);
  const challenge = buildImportChallenge(params.bundle);
  if (challenge.ownershipQuizRequired && challenge.questions.length > 0) {
    const v = verifyOwnershipQuiz(tasks, params.importOwnershipAnswers || [], fp);
    if (!v.ok) {
      return {
        success: false,
        dryRun: params.dryRun,
        inserted: {},
        skipped: {},
        conflicts: {},
        errors: [{ table: "ownership", field: "quiz", message: v.message || "Verification failed" }],
      };
    }
  }

  const inserted: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const conflicts: Record<string, number> = { duplicateFingerprints: 0 };

  const validForInsert: InsertTask[] = [];
  for (const t of tasks) {
    const fingerprint = computeTaskFingerprint(t);
    const seen = await hasImportFingerprint(params.userId, fingerprint);
    if (seen) {
      conflicts.duplicateFingerprints += 1;
      continue;
    }
    validForInsert.push(t);
  }

  const duplicateCount = tasks.length - validForInsert.length;
  skipped.duplicateFingerprints = duplicateCount;

  const quota = await assertCanCreateTasks(params.userId, validForInsert.length);
  if (!quota.ok) {
    return {
      success: false,
      dryRun: params.dryRun,
      inserted: {},
      skipped: {},
      conflicts: {},
      errors: [{ table: "tasks", field: "quota", message: quota.message || "Task limit" }],
    };
  }

  if (validForInsert.length > 50000) {
    return {
      success: false,
      dryRun: params.dryRun,
      inserted: {},
      skipped: {},
      conflicts: {},
      errors: [{ table: "tasks", field: "count", message: "Maximum 50,000 new tasks per import" }],
    };
  }

  if (!params.dryRun && validForInsert.length > 0) {
    const BATCH = 500;
    for (let i = 0; i < validForInsert.length; i += BATCH) {
      const slice = validForInsert.slice(i, i + BATCH);
      const created = await storage.createTasksBulk(params.userId, slice);
      for (let j = 0; j < created.length; j++) {
        const fpInner = computeTaskFingerprint(slice[j]);
        await recordImportFingerprint(params.userId, fpInner, "account_json_import", created[j]?.id);
      }
    }
  }

  inserted.tasks = validForInsert.length;

  const badgeList = parsed.data.data.badges || [];
  let badgeInserted = 0;
  let badgeSkipped = 0;
  for (const b of badgeList) {
    const [existing] = await db
      .select({ id: userBadges.id })
      .from(userBadges)
      .where(and(eq(userBadges.userId, params.userId), eq(userBadges.badgeId, b.badgeId)))
      .limit(1);
    if (existing) {
      badgeSkipped++;
      continue;
    }
    if (!params.dryRun) {
      await db.insert(userBadges).values({
        id: randomUUID(),
        userId: params.userId,
        badgeId: b.badgeId,
      });
    }
    badgeInserted++;
  }
  inserted.badges = badgeInserted;
  skipped.badges = badgeSkipped;

  await appendSecurityEvent({
    eventType: params.dryRun ? "account_import_dry_run" : "account_import_completed",
    actorUserId: params.userId,
    route: "/api/account/import",
    method: "POST",
    statusCode: 200,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    payload: {
      dryRun: params.dryRun,
      tasksNew: validForInsert.length,
      tasksSkippedDuplicates: skipped.duplicateFingerprints,
      badgesInserted: badgeInserted,
    },
  });

  return {
    success: true,
    dryRun: params.dryRun,
    inserted,
    skipped,
    conflicts,
    warnings,
  };
}
