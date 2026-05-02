// @vitest-environment node
/**
 * Integration test for account import dry-run / wet-run + fingerprint dedupe.
 *
 * Run only with RUN_PG_SCHEMA_TESTS=1 and a reachable DATABASE_URL.
 * Skipped by default so local `npm test` stays fast without Postgres.
 */
import { sql, eq, and } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  users,
  tasks,
  userBadges,
  taskImportFingerprints,
} from "@shared/schema";

const RUN = process.env.RUN_PG_SCHEMA_TESTS === "1";

/** Types from the real db module. */
let db: { execute: (q: unknown) => Promise<unknown>; insert: (t: unknown) => { values: (v: unknown) => Promise<unknown> }; delete: (t: unknown) => { where: (w: unknown) => Promise<unknown> }; select: (...args: unknown[]) => { from: (t: unknown) => { where: (w: unknown) => Promise<unknown[]> } } };
let pool: { end: () => Promise<void> };

let runAccountImport: typeof import("./account-backup").runAccountImport;
let buildImportChallenge: typeof import("./account-backup").buildImportChallenge;

describe.skipIf(!RUN)("account backup integration", () => {
  const userId = "00000000-0000-4000-8000-000000000099";
  const userEmail = "backup-test@example.invalid";

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when RUN_PG_SCHEMA_TESTS=1");
    }
    vi.resetModules();
    const mod = await import("./db");
    db = mod.db as unknown as typeof db;
    pool = mod.pool;

    const ab = await import("./account-backup");
    runAccountImport = ab.runAccountImport;
    buildImportChallenge = ab.buildImportChallenge;
  });

  beforeEach(async () => {
    // Ensure clean state for the test user
    await db.delete(users).where(eq(users.id, userId));
    // Re-insert user (cascade deletes children above, but re-insert is safe)
    await db.insert(users).values({ id: userId, email: userEmail });
  });

  afterAll(async () => {
    if (db) {
      await db.delete(users).where(eq(users.id, userId));
    }
    if (pool) {
      await pool.end();
    }
  });

  function makeTask(activity: string, date = "2025-01-01") {
    return {
      date,
      activity,
      recurrence: "none" as const,
      status: "pending" as const,
      visibility: "private" as const,
      communityShowNotes: false as const,
    };
  }

  function makeBundle(activities: string[]) {
    return {
      metadata: { exportMode: "user" as const },
      data: {
        tasks: activities.map((a) => makeTask(a)),
        badges: [{ badgeId: "integration-badge" }],
      },
    };
  }

  async function countRows() {
    const [taskRows] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(eq(tasks.userId, userId));
    const [badgeRows] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userBadges)
      .where(eq(userBadges.userId, userId));
    const [fpRows] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(taskImportFingerprints)
      .where(eq(taskImportFingerprints.userId, userId));
    return {
      tasks: Number(taskRows?.count ?? 0),
      badges: Number(badgeRows?.count ?? 0),
      fingerprints: Number(fpRows?.count ?? 0),
    };
  }

  /** Build ownership answers for a single-task bundle. With only 1 task the
   *  correct answer is the activity itself; synthetic distractors never match. */
  function answersForSingleTask(bundle: { data: { tasks: { activity: string }[] } }, challenge: { questions: { id: string; choices: string[] }[] }) {
    const activity = bundle.data.tasks[0].activity;
    return challenge.questions.map((q) => ({
      questionId: q.id,
      selectedIndex: q.choices.indexOf(activity),
    }));
  }

  it("dryRun=true does not insert tasks, badges, or fingerprints", async () => {
    const bundle = makeBundle(["Dry run activity"]);
    const challenge = buildImportChallenge(bundle);
    const answers = answersForSingleTask(bundle, challenge);

    const before = await countRows();
    const result = await runAccountImport({ userId, bundle, dryRun: true, importOwnershipAnswers: answers });
    const after = await countRows();

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(after.tasks).toBe(before.tasks);
    expect(after.badges).toBe(before.badges);
    expect(after.fingerprints).toBe(before.fingerprints);
  });

  it("dryRun=false inserts tasks, badges, and fingerprints", async () => {
    const bundle = makeBundle(["Wet run activity"]);
    const challenge = buildImportChallenge(bundle);
    const answers = answersForSingleTask(bundle, challenge);

    const before = await countRows();
    const result = await runAccountImport({ userId, bundle, dryRun: false, importOwnershipAnswers: answers });
    const after = await countRows();

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(after.tasks).toBe(before.tasks + 1);
    expect(after.badges).toBe(before.badges + 1);
    expect(after.fingerprints).toBe(before.fingerprints + 1);
  });

  it("re-importing the same bundle skips duplicates via fingerprint dedupe", async () => {
    // Two tasks with identical fingerprint dimensions → same bundle fingerprint
    const bundle = makeBundle(["Dedupe A", "Dedupe A"]);
    const challenge = buildImportChallenge(bundle);
    // With 2 tasks there are 2 questions; for each question the correct answer is "Dedupe A".
    const answers = challenge.questions.map((q) => ({
      questionId: q.id,
      selectedIndex: q.choices.indexOf("Dedupe A"),
    }));

    // First import (wet) — intra-bundle duplicates are both inserted because
    // hasImportFingerprint only checks the DB, not the in-flight bundle.
    const first = await runAccountImport({ userId, bundle, dryRun: false, importOwnershipAnswers: answers });
    expect(first.success).toBe(true);
    expect(first.inserted.tasks).toBe(2);

    // Second import (wet) — both fingerprints already exist in DB → skipped
    const second = await runAccountImport({ userId, bundle, dryRun: false, importOwnershipAnswers: answers });
    expect(second.success).toBe(true);
    expect(second.inserted.tasks).toBe(0);
    expect(second.skipped.duplicateFingerprints).toBe(2);
  });
});
