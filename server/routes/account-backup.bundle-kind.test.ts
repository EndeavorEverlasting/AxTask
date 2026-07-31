// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isMigrationUserExportBundle } from "./account-backup";

describe("account backup bundle routing", () => {
  it("keeps Backup Center semantic exports on the account importer", () => {
    const backupCenterBundle = {
      metadata: {
        exportMode: "user" as const,
        schemaVersion: 1,
        exportedAt: "2026-07-31T00:00:00.000Z",
        tableCounts: { tasks: 1, badges: 0 },
      },
      data: {
        tasks: [
          {
            date: "2026-07-31",
            activity: "Round-trip contract task",
            recurrence: "none",
            status: "pending",
            visibility: "private",
            communityShowNotes: false,
          },
        ],
        walletSnapshot: {
          balance: 0,
          lifetimeEarned: 0,
          currentStreak: 0,
          longestStreak: 0,
          lastCompletionDate: null,
        },
        badges: [],
      },
    };

    expect(isMigrationUserExportBundle(backupCenterBundle)).toBe(false);
  });

  it("recognizes table-shaped migration user exports by their users table", () => {
    const migrationBundle = {
      metadata: {
        exportMode: "user" as const,
        schemaVersion: 1,
        exportedAt: "2026-07-31T00:00:00.000Z",
        sourceEnvironment: "test",
        userId: "source-user",
        tableCounts: { users: 1, tasks: 1 },
      },
      data: {
        users: [{ id: "source-user", email: "source@example.invalid" }],
        tasks: [{ id: "task-1", userId: "source-user", date: "2026-07-31", activity: "Task" }],
      },
    };

    expect(isMigrationUserExportBundle(migrationBundle)).toBe(true);
  });

  it("fails closed when a purported migration bundle has no source user row", () => {
    const malformed = {
      metadata: { exportMode: "user", schemaVersion: 1 },
      data: { users: [], tasks: [{ id: "task-1", userId: "missing-user" }] },
    };

    expect(isMigrationUserExportBundle(malformed)).toBe(false);
  });
});
