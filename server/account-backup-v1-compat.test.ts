// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

// The pure planAccountImport / buildImportChallenge / normalizeV1TaskRow code
// does not touch the database, but `server/account-backup.ts` transitively
// imports `server/db.ts` (via `./storage`), which throws at module load time
// if DATABASE_URL is missing. Mock the db module so this file can run under
// plain `npx vitest run` with no environment setup.
vi.mock("./db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async () => undefined),
    })),
  },
}));

vi.mock("./storage", () => ({
  appendSecurityEvent: vi.fn(),
  assertCanCreateTasks: vi.fn(async () => ({ ok: true })),
  getOrCreateWallet: vi.fn(),
  getUserBadges: vi.fn(),
  hasImportFingerprint: vi.fn(async () => false),
  recordImportFingerprint: vi.fn(),
  storage: {
    createTasksBulk: vi.fn(async () => []),
  },
}));

import { insertTaskSchema, userBadges, type InsertTask } from "@shared/schema";
import {
  buildImportChallenge,
  computeBundleTasksFingerprint,
  normalizeV1TaskRow,
  planAccountImport,
  runAccountImport,
} from "./account-backup";
import { db } from "./db";
import { appendSecurityEvent, storage } from "./storage";

/**
 * Backward-compatibility contract for schemaVersion-1 backup JSON.
 *
 * Baseline reference: `docs/json imports of rich perez account.zip` (kept local
 * only via .gitignore, see docs/CLIENT_VISIBLE_PRIVACY notes). This suite
 * exercises every edge case those v1 exports produced against the current
 * shared/schema.ts — without depending on the zip or any real PII — by using
 * the synthetic fixture at test-fixtures/account-backup-v1-sample.json.
 *
 * The point is: loading a four-year-old export must still work on the latest
 * schema. Augment, don't deprecate.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "..", "test-fixtures", "account-backup-v1-sample.json");

function loadFixture(): unknown {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
}

describe("account import v1 backward compatibility", () => {
  const fixture = loadFixture() as {
    metadata: { schemaVersion: number; tableCounts: Record<string, number> };
    data: { tasks: Record<string, unknown>[]; badges?: { badgeId: string }[] };
  };

  it("fixture looks like a v1 user export", () => {
    expect(fixture.metadata.schemaVersion).toBe(1);
    expect(fixture.metadata.tableCounts.tasks).toBe(12);
    expect(fixture.data.tasks).toHaveLength(12);
  });

  it("every v1 task row parses via normalizeV1TaskRow + insertTaskSchema", () => {
    for (let i = 0; i < fixture.data.tasks.length; i++) {
      const row = fixture.data.tasks[i];
      expect(
        () => insertTaskSchema.parse(normalizeV1TaskRow(row)),
        `task row ${i} (activity=${row.activity})`,
      ).not.toThrow();
    }
  });

  it("normalizeV1TaskRow strips nulls on optional task fields only", () => {
    const row = {
      date: "2022-07-20",
      activity: "X",
      time: null,
      urgency: null,
      impact: null,
      effort: null,
      notes: null,
      prerequisites: null,
      recurrence: "none",
      // DB-side extras that zod should strip; keep them in the input:
      id: "abc",
      userId: "def",
      priority: "Low",
      priorityScore: 0,
      classification: "General",
      isRepeated: false,
      sortOrder: 10,
      contentHash: "hash",
      forceImported: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      bounty: 0,
      bountySetBy: null,
    };
    const normalized = normalizeV1TaskRow(row);
    for (const k of ["time", "urgency", "impact", "effort", "notes", "prerequisites"]) {
      expect(normalized).not.toHaveProperty(k);
    }
    // DB-side extras survive normalize (zod strips them later)
    expect(normalized).toHaveProperty("id");
    expect(normalized).toHaveProperty("priority");
    expect(normalized).toHaveProperty("contentHash");

    const parsed = insertTaskSchema.parse(normalized);
    // defaults filled in from shared/schema.ts
    expect(parsed.visibility).toBe("private");
    expect(parsed.communityShowNotes).toBe(false);
    expect(parsed.status).toBe("pending");
    // DB-side extras stripped by zod
    expect(parsed as unknown as Record<string, unknown>).not.toHaveProperty("id");
    expect(parsed as unknown as Record<string, unknown>).not.toHaveProperty("priorityScore");
    expect(parsed as unknown as Record<string, unknown>).not.toHaveProperty("contentHash");
  });

  it("planAccountImport returns all 12 tasks plus both badges with a stable fingerprint", () => {
    const result = planAccountImport(fixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tasks).toHaveLength(12);
    expect(result.badges).toEqual([{ badgeId: "starter" }, { badgeId: "week-1-streak" }]);
    expect(result.schemaVersion).toBe(1);
    expect(result.tasksFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("planAccountImport fingerprint is deterministic across runs", () => {
    const a = planAccountImport(loadFixture());
    const b = planAccountImport(loadFixture());
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.tasksFingerprint).toBe(b.tasksFingerprint);
    expect(computeBundleTasksFingerprint(a.tasks)).toBe(a.tasksFingerprint);
  });

  it("buildImportChallenge surfaces an ownership quiz with 3 questions for the fixture", () => {
    const challenge = buildImportChallenge(fixture);
    expect(challenge.ownershipQuizRequired).toBe(true);
    expect(challenge.questions).toHaveLength(3);
    expect(challenge.tasksFingerprint).toMatch(/^[a-f0-9]{64}$/);
    for (const q of challenge.questions) {
      expect(q.choices).toHaveLength(4);
      expect(q.prompt).toMatch(/ownership check/i);
    }
  });

  it("rejects a bundle where a task row is truly malformed (not a null-only issue)", () => {
    const bad = JSON.parse(JSON.stringify(fixture));
    // activity is required and non-empty; we make it invalid to confirm the
    // coercion did not silently make validation unconditionally permissive.
    bad.data.tasks[0].activity = "";
    const result = planAccountImport(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].table).toBe("tasks");
    expect(result.errors[0].field).toBe("0");
  });

  it("accepts a minimal bundle with zero tasks and no badges", () => {
    const empty = {
      metadata: { exportMode: "user", schemaVersion: 1 },
      data: { tasks: [] },
    };
    const result = planAccountImport(empty);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tasks).toHaveLength(0);
    expect(result.badges).toEqual([]);
    expect(result.tasksFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a bundle with an invalid top-level shape", () => {
    const result = planAccountImport({ not: "a bundle" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({ table: "bundle", field: "root" });
  });

  // ─── Duplicate Fingerprint Behavior ────────────────────────────────────────

  it("computeBundleTasksFingerprint returns a sha256 hex string", () => {
    const tasks: InsertTask[] = [insertTaskSchema.parse({ date: "2025-01-01", activity: "A" })];
    expect(computeBundleTasksFingerprint(tasks)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("computeBundleTasksFingerprint is deterministic and order-independent", () => {
    const t1 = insertTaskSchema.parse({ date: "2025-01-01", activity: "A" });
    const t2 = insertTaskSchema.parse({ date: "2025-01-02", activity: "B" });
    const a = computeBundleTasksFingerprint([t1, t2]);
    const b = computeBundleTasksFingerprint([t2, t1]);
    expect(a).toBe(b);
  });

  it("computeBundleTasksFingerprint changes when any task changes", () => {
    const t1 = insertTaskSchema.parse({ date: "2025-01-01", activity: "A" });
    const t2 = insertTaskSchema.parse({ date: "2025-01-01", activity: "A-changed" });
    expect(computeBundleTasksFingerprint([t1])).not.toBe(computeBundleTasksFingerprint([t2]));
  });

  // ─── Invalid Backup Shape ──────────────────────────────────────────────────

  it("rejects bundle with wrong exportMode", () => {
    const result = planAccountImport({ metadata: { exportMode: "admin" }, data: { tasks: [] } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({ table: "bundle", field: "root", message: "Invalid backup JSON shape" });
  });

  it("rejects bundle with data.tasks not an array", () => {
    const result = planAccountImport({ metadata: { exportMode: "user" }, data: { tasks: "nope" } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({ table: "bundle", field: "root" });
  });

  it("rejects deeply malformed task row with structured errors", () => {
    const bad = {
      metadata: { exportMode: "user", schemaVersion: 1 },
      data: {
        tasks: [
          { date: "", activity: "", recurrence: "none", status: "pending", visibility: "private", communityShowNotes: false },
        ],
      },
    };
    const result = planAccountImport(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].table).toBe("tasks");
    expect(result.errors[0].field).toBe("0");
    expect(result.errors[0].message).toBeTruthy();
  });

  // ─── Ownership Challenge Generation ────────────────────────────────────────

  it("buildImportChallenge requires ownership quiz when tasks exist", () => {
    const bundle = {
      metadata: { exportMode: "user" },
      data: { tasks: [insertTaskSchema.parse({ date: "2025-01-01", activity: "Quiz test" })] },
    };
    const challenge = buildImportChallenge(bundle);
    expect(challenge.ownershipQuizRequired).toBe(true);
  });

  it("buildImportChallenge question count does not exceed task count", () => {
    const bundle = {
      metadata: { exportMode: "user" },
      data: { tasks: [insertTaskSchema.parse({ date: "2025-01-01", activity: "Single" })] },
    };
    const challenge = buildImportChallenge(bundle);
    expect(challenge.questionCount).toBeLessThanOrEqual(1);
    expect(challenge.questions).toHaveLength(challenge.questionCount);
  });

  it("buildImportChallenge does not require quiz for empty backup", () => {
    const empty = { metadata: { exportMode: "user" }, data: { tasks: [] } };
    const challenge = buildImportChallenge(empty);
    expect(challenge.ownershipQuizRequired).toBe(false);
    expect(challenge.questionCount).toBe(0);
    expect(challenge.questions).toHaveLength(0);
    expect(challenge.tasksFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  // ─── Dry Run Does Not Mutate ─────────────────────────────────────────────

  it("dryRun=true does not call storage.createTasksBulk or db.insert(userBadges)", async () => {
    const bundle = {
      metadata: { exportMode: "user" },
      data: {
        tasks: [insertTaskSchema.parse({ date: "2025-01-01", activity: "Dry run task" })],
        badges: [{ badgeId: "dry-run-badge" }],
      },
    };
    const challenge = buildImportChallenge(bundle);
    const correct = challenge.questions[0].choices.indexOf("Dry run task");
    const result = await runAccountImport({
      userId: "user-dry",
      bundle,
      dryRun: true,
      importOwnershipAnswers: challenge.questions.map((q) => ({
        questionId: q.id,
        selectedIndex: correct,
      })),
    });
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(storage.createTasksBulk).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalledWith(userBadges);
    expect(appendSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "account_import_dry_run",
        actorUserId: "user-dry",
      }),
    );
  });

  it("dryRun=false calls storage.createTasksBulk and db.insert(userBadges)", async () => {
    const bundle = {
      metadata: { exportMode: "user" },
      data: {
        tasks: [insertTaskSchema.parse({ date: "2025-01-01", activity: "Wet run task" })],
        badges: [{ badgeId: "wet-run-badge" }],
      },
    };
    const challenge = buildImportChallenge(bundle);
    const correct = challenge.questions[0].choices.indexOf("Wet run task");
    const result = await runAccountImport({
      userId: "user-wet",
      bundle,
      dryRun: false,
      importOwnershipAnswers: challenge.questions.map((q) => ({
        questionId: q.id,
        selectedIndex: correct,
      })),
    });
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(storage.createTasksBulk).toHaveBeenCalledTimes(1);
    expect(db.insert).toHaveBeenCalledWith(userBadges);
    expect(appendSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "account_import_completed",
        actorUserId: "user-wet",
      }),
    );
  });

  // ─── Bundle Fingerprint Collision Smoke Test ───────────────────────────────

  it("computeBundleTasksFingerprint shows no collisions among 1,000 random bundles", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1_000; i++) {
      const tasks: InsertTask[] = Array.from({ length: 3 + Math.floor(Math.random() * 5) }, () =>
        insertTaskSchema.parse({
          date: `2025-${String(Math.floor(Math.random() * 12) + 1).padStart(2, "0")}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`,
          time: [undefined, "08:00", "14:30"][Math.floor(Math.random() * 3)],
          activity: `Activity ${Math.random().toString(36).slice(2, 8)}`,
          notes: [undefined, "", "note"][Math.floor(Math.random() * 3)],
          recurrence: "none",
          status: "pending",
          visibility: "private",
          communityShowNotes: false,
        }),
      );
      const fp = computeBundleTasksFingerprint(tasks);
      expect(seen.has(fp)).toBe(false);
      seen.add(fp);
    }
    expect(seen.size).toBe(1_000);
  });
});
