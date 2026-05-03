// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");

describe("calendar holidays + preferences contracts", () => {
  it("exposes authenticated calendar preference and public-holiday routes", () => {
    const routes = fs.readFileSync(path.join(projectRoot, "server", "routes.ts"), "utf8");
    expect(routes).toContain('app.get("/api/calendar/preferences"');
    expect(routes).toContain('app.patch("/api/calendar/preferences"');
    expect(routes).toContain('app.get("/api/calendar/public-holidays"');
    expect(routes).toContain("updateCalendarPreferenceSchema.parse");
    expect(routes).toContain("loadMergedPublicHolidays");
    expect(routes).toContain("getUserCalendarPreference");
    expect(routes).toContain("upsertUserCalendarPreference");
  });

  it("ships SQL migration for user_calendar_preferences", () => {
    const sql = fs.readFileSync(
      path.join(projectRoot, "migrations", "0031_user_calendar_preferences.sql"),
      "utf8",
    );
    expect(sql).toContain("user_calendar_preferences");
    expect(sql).toContain("show_holidays");
  });

  it("declares calendar prefs table + PATCH schema in Drizzle core", () => {
    const core = fs.readFileSync(path.join(projectRoot, "shared", "schema", "core.ts"), "utf8");
    expect(core).toContain('pgTable("user_calendar_preferences"');
    expect(core).toContain("updateCalendarPreferenceSchema");
  });
});
