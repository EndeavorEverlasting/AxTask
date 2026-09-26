import { describe, expect, it } from "vitest";
import { readRepoFile } from "./test-utils";

describe("Shared Task Tracker operator documentation", () => {
  const guide = readRepoFile("docs/SHARED_TASK_TRACKER_OPERATOR_GUIDE.md");
  const checklist = readRepoFile("docs/SHARED_TASK_TRACKER_APPS_SCRIPT_INSTALL_CHECKLIST.md");
  const plan = readRepoFile("docs/ASSISTANT_ACTION_EXECUTION_PLAN.md");
  const rootReadme = readRepoFile("README.md");
  const googleSheetsSetup = readRepoFile("docs/GOOGLE_SHEETS_SETUP.md");

  it("teaches the current old-way to new-way transition without promoting Submit prematurely", () => {
    expect(guide).toContain("Daily Planner 2026");
    expect(guide).toContain("Task Board");
    expect(guide).toContain("WAITING — install bound Apps Script to enable Submit");
    expect(guide).toContain("rows **2 through 24996**");
    expect(guide).toContain("legacy block beginning at row 24997");
  });

  it("keeps the provider workbook as the Apps Script source of truth", () => {
    expect(guide).toContain("Scripts!B2");
    expect(checklist).toContain("Scripts!B2");
    expect(checklist).toContain("TrackerV2.gs");
    expect(checklist).toContain("Files to create for the current Tracker V2 install: exactly one");
    expect(checklist).toContain("No public web-app deployment.");
    expect(checklist).toContain("No manually installed trigger required.");
    expect(plan).toContain("provider-owned workbook `Scripts!B2`");
  });

  it("does not teach the unproved blank-date shortcut", () => {
    for (const doc of [guide, checklist]) {
      expect(doc).not.toContain("leave Date blank for today");
      expect(doc).not.toContain("blank means today");
      expect(doc).not.toContain("Activity only; Date may be blank for today");
    }
    expect(guide).toContain("enter an explicit date in A4");
    expect(checklist).toContain("choose an explicit valid Date in A4");
    expect(plan).toContain("blank-date `new Date()` fallback is UNPROVEN");
  });

  it("routes users away from generic or destructive sync instructions", () => {
    expect(rootReadme).toContain("SHARED_TASK_TRACKER_OPERATOR_GUIDE.md");
    expect(rootReadme).toContain("SHARED_TASK_TRACKER_APPS_SCRIPT_INSTALL_CHECKLIST.md");
    expect(googleSheetsSetup).toContain("2026 Shared Task Tracker users — start here instead");
    expect(guide).toContain("must **not** be pointed at this tracker");
  });
});
