// @vitest-environment node
/**
 * Integration tests for account backup import/export behavior.
 *
 * Run only with RUN_PG_SCHEMA_TESTS=1 and a reachable disposable DATABASE_URL.
 * Skipped by default so local `npm test` stays fast without Postgres.
 */
import { sql, eq } from "drizzle-orm";
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
let buildUserExportBundle: typeof import("./account-backup").buildUserExportBundle;

describe.skipIf(!RUN)("account backup integration", () => {
  const userId = "00000000-0000-4000-8000-000000000099";
  const userEmail = "backup-test@example.invalid";
  const roundTripSourceId = "00000000-0000-4000-8000-000000000098";
  const roundTripSourceEmail = "backup-roundtrip-source@example.invalid";

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
    buildUserExportBundle = ab.buildUserExportBundle;
  });

  beforeEach(async () => {
    // Ensure clean state for both disposable certification users.
    await db.delete(users).where(eq(users.id, roundTripSourceId));
    await db.delete(users).where(eq(users.id, userId));
    await db.insert(users).values({ id: userId, email: userEmail });
  });

  afterAll(async () => {
    if (db) {
      await db.delete(users).where(eq(users.id, roundTripSourceId));
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

  async function countRows(forUserId = userId) {
    const [taskRows] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(eq(tasks.userId, forUserId));
    const [badgeRows] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userBadges)
      .where(eq(userBadges.userId, forUserId));
    const [fpRows] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(taskImportFingerprints)
      .where(eq(taskImportFingerprints.userId, forUserId));
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

    // First import (wet) — intra-bundle duplicate is coalesced before DB check.
    const first = await runAccountImport({ userId, bundle, dryRun: false, importOwnershipAnswers: answers });
    expect(first.success).toBe(true);
    expect(first.inserted.tasks).toBe(1);
    expect(first.skipped.duplicateFingerprints).toBe(1);

    // Second import (wet) — both tasks collide with the DB fingerprint.
    const second = await runAccountImport({ userId, bundle, dryRun: false, importOwnershipAnswers: answers });
    expect(second.success).toBe(true);
    expect(second.inserted.tasks).toBe(0);
    expect(second.skipped.duplicateFingerprints).toBe(2);
  });

  it("exports and restores a disposable account without mutating the source", async () => {
    await db.insert(users).values({ id: roundTripSourceId, email: roundTripSourceEmail });

    const seedBundle = makeBundle(["Round-trip source activity"]);
    const seedChallenge = buildImportChallenge(seedBundle);
    const seedAnswers = answersForSingleTask(seedBundle, seedChallenge);
    const seeded = await runAccountImport({
      userId: roundTripSourceId,
      bundle: seedBundle,
      dryRun: false,
      importOwnershipAnswers: seedAnswers,
    });
    expect(seeded.success).toBe(true);

    const sourceBefore = await countRows(roundTripSourceId);
    expect(sourceBefore).toEqual({ tasks: 1, badges: 1, fingerprints: 1 });

    const exported = await buildUserExportBundle(roundTripSourceId);
    expect(exported.metadata.exportMode).toBe("user");
    expect(exported.metadata.schemaVersion).toBe(1);
    expect(exported.metadata.tableCounts.tasks).toBe(1);
    expect(exported.metadata.tableCounts.badges).toBe(1);
    expect(exported.data.tasks[0]?.activity).toBe("Round-trip source activity");
    expect(exported.data.walletSnapshot).toBeDefined();

    const targetChallenge = buildImportChallenge(exported);
    const targetAnswers = answersForSingleTask(exported, targetChallenge);

    const targetBefore = await countRows(userId);
    const dryRun = await runAccountImport({
      userId,
      bundle: exported,
      dryRun: true,
      importOwnershipAnswers: targetAnswers,
    });
    expect(dryRun.success).toBe(true);
    expect(dryRun.inserted.tasks).toBe(1);
    expect(await countRows(userId)).toEqual(targetBefore);

    const restored = await runAccountImport({
      userId,
      bundle: exported,
      dryRun: false,
      importOwnershipAnswers: targetAnswers,
    });
    expect(restored.success).toBe(true);
    expect(restored.inserted.tasks).toBe(1);
    expect(restored.inserted.badges).toBe(1);
    expect(restored.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "wallets",
          field: "balance",
        }),
      ]),
    );

    const [restoredTask] = await db
      .select({ activity: tasks.activity, date: tasks.date, notes: tasks.notes })
      .from(tasks)
      .where(eq(tasks.userId, userId));
    expect(restoredTask).toMatchObject({
      activity: "Round-trip source activity",
      date: "2025-01-01",
      notes: "",
    });

    expect(await countRows(userId)).toEqual({ tasks: 1, badges: 1, fingerprints: 1 });
    expect(await countRows(roundTripSourceId)).toEqual(sourceBefore);

    const duplicate = await runAccountImport({
      userId,
      bundle: exported,
      dryRun: false,
      importOwnershipAnswers: targetAnswers,
    });
    expect(duplicate.success).toBe(true);
    expect(duplicate.inserted.tasks).toBe(0);
    expect(duplicate.skipped.duplicateFingerprints).toBe(1);
    expect(await countRows(userId)).toEqual({ tasks: 1, badges: 1, fingerprints: 1 });
  });
});
