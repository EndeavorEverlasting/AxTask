// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, "admin.tsx"), "utf8");

describe("Admin page active users visibility contract", () => {
  it("expects active user fields from /api/admin/analytics/overview", () => {
    expect(SRC).toContain("activeUsers24h: number;");
    expect(SRC).toContain("isSingleActiveUser: boolean;");
    expect(SRC).toContain("activeWindowHours: number;");
  });

  it("shows an Active users (24h) KPI in Live Analytics", () => {
    expect(SRC).toContain("Active users (24h)");
    expect(SRC).toContain("animatedActiveUsers24h");
  });

  it("renders single-active-user callouts in Live Analytics and Users tab", () => {
    expect(SRC).toContain("You are currently the only active user");
    expect(SRC).toContain("Only one user is active in this window.");
    expect(SRC).toContain("liveAnalytics?.isSingleActiveUser");
  });

  it("renders AI cost trend and runtime controls", () => {
    expect(SRC).toContain("AI Cost Trend (14d)");
    expect(SRC).toContain("AI Runtime Controls");
    expect(SRC).toContain("liveAnalytics?.aiRuntime.externalClassifierEnabled");
    expect(SRC).toContain("estimatedCost7dCents");
  });
});

