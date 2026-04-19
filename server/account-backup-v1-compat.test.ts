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
vi.mock("./db", () => ({ db: {} }));

import { insertTaskSchema } from "@shared/schema";
import {
  buildImportChallenge,
  computeBundleTasksFingerprint,
  normalizeV1TaskRow,
  planAccountImport,
} from "./account-backup";

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
});
