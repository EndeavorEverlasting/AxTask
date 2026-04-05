// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  GoogleSheetsAPI,
  createGoogleSheetsAPI,
} from "./google-sheets-api";
import type { Task } from "@shared/schema";

const testCreds = {
  apiKey: "AIzaSyDummyKeyForUnitTestsOnly00000000000",
  clientId: "unit-test-client-id",
  clientSecret: "unit-test-client-secret",
};

function makeApi(overrides?: Partial<typeof testCreds> & { accessToken?: string; refreshToken?: string }) {
  return createGoogleSheetsAPI({ ...testCreds, ...overrides });
}

describe("createGoogleSheetsAPI", () => {
  it("throws when API key is missing", () => {
    expect(() =>
      createGoogleSheetsAPI({
        ...testCreds,
        apiKey: "",
      }),
    ).toThrow(/Missing required Google API credentials/);
  });

  it("throws when API key does not look like a Google API key", () => {
    expect(
      () =>
        new GoogleSheetsAPI({
          ...testCreds,
          apiKey: "not-an-aiza-key",
        }),
    ).toThrow(/Invalid API key format/);
  });

  it("builds OAuth URL including Sheets scope", () => {
    const api = makeApi();
    const url = api.generateAuthUrl();
    expect(url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url).toContain(encodeURIComponent("https://www.googleapis.com/auth/spreadsheets"));
  });
});

describe("GoogleSheetsAPI sheet row parsing (private via cast)", () => {
  it("parseTasksFromSheets skips empty rows and requires date + activity", () => {
    const api = makeApi() as any;
    const rows = [
      [],
      ["2025-01-01", "Valid task", "", "⭐⭐⭐⭐", "General", "7.5", 4, 3, 2, "", "FALSE"],
      ["", "", ""],
    ];
    const tasks = api.parseTasksFromSheets(rows);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].activity).toBe("Valid task");
    expect(tasks[0].priority).toBe("High");
    expect(tasks[0].status).toBe("pending");
  });

  it("parseStatus accepts TRUE and completed", () => {
    const api = makeApi() as any;
    const t1 = api.parseTasksFromSheets([
      ["2025-01-01", "Done", "", "⭐", "General", "5", 3, 3, 3, "", "TRUE"],
    ]);
    expect(t1[0].status).toBe("completed");
    const t2 = api.parseTasksFromSheets([
      ["2025-01-01", "Done2", "", "⭐", "General", "5", 3, 3, 3, "", "completed"],
    ]);
    expect(t2[0].status).toBe("completed");
  });
});

describe("GoogleSheetsAPI mergeTaskLists (private via cast)", () => {
  const base = (partial: Partial<Task> & Pick<Task, "id" | "date" | "activity">): Task =>
    ({
      notes: null,
      priority: "Medium",
      classification: "General",
      priorityScore: 50,
      urgency: 3,
      impact: 3,
      effort: 3,
      prerequisites: null,
      status: "pending",
      isRepeated: false,
      time: null,
      sortOrder: 0,
      userId: null,
      ...partial,
    }) as Task;

  it("adds remote-only tasks to merged list with new ids", () => {
    const api = makeApi() as any;
    const local: Task[] = [
      base({
        id: "1",
        date: "2025-01-01",
        activity: "Local only",
        createdAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-01-01"),
      }),
    ];
    const remote: Task[] = [
      base({
        id: "sheet-0",
        date: "2025-01-02",
        activity: "From sheet",
        createdAt: new Date("2025-01-02"),
        updatedAt: new Date("2025-01-02"),
      }),
    ];
    const { merged, conflicts } = api.mergeTaskLists(local, remote);
    expect(conflicts).toHaveLength(0);
    expect(merged.some((t: Task) => t.activity === "From sheet")).toBe(true);
    expect(merged.find((t: Task) => t.activity === "From sheet")?.id).toMatch(
      /^imported-/,
    );
  });

  it("records conflict when local is newer and both sides differ", () => {
    const api = makeApi() as any;
    const local: Task[] = [
      base({
        id: "keep-id",
        date: "2025-01-01",
        activity: "Shared",
        notes: "local note",
        createdAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-06-15"),
      }),
    ];
    const remote: Task[] = [
      base({
        id: "sheet-0",
        date: "2025-01-01",
        activity: "Shared",
        notes: "remote note",
        createdAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-01-02"),
      }),
    ];
    const { merged, conflicts } = api.mergeTaskLists(local, remote);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].reason).toContain("newer");
    const still = merged.find((t: Task) => t.id === "keep-id");
    expect(still?.notes).toBe("local note");
  });

  it("replaces local with remote when remote is newer and fields differ", () => {
    const api = makeApi() as any;
    const local: Task[] = [
      base({
        id: "keep-id",
        date: "2025-01-01",
        activity: "Shared",
        notes: "old",
        createdAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-01-01"),
      }),
    ];
    const remote: Task[] = [
      base({
        id: "sheet-0",
        date: "2025-01-01",
        activity: "Shared",
        notes: "from sheet",
        createdAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-06-20"),
      }),
    ];
    const { merged, conflicts } = api.mergeTaskLists(local, remote);
    expect(conflicts).toHaveLength(0);
    const updated = merged.find((t: Task) => t.id === "keep-id");
    expect(updated?.notes).toBe("from sheet");
  });
});
