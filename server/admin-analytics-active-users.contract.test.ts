import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = fs.readFileSync(path.resolve(__dirname, "routes.ts"), "utf8");

describe("GET /api/admin/analytics/overview active users contract", () => {
  it("computes an explicit 24h activity window", () => {
    expect(SRC).toContain("const activeUsersSince = new Date(now.getTime() - 24 * 60 * 60 * 1000)");
  });

  it("counts distinct actor user IDs from recent events", () => {
    expect(SRC).toContain("const activeUserIds24h = new Set(");
    expect(SRC).toContain("if (!event.actorUserId || !event.createdAt) return false;");
    expect(SRC).toContain("new Date(event.createdAt) >= activeUsersSince");
    expect(SRC).toContain("const activeUsers24h = activeUserIds24h.size");
  });

  it("returns active user fields for admin UI messaging", () => {
    expect(SRC).toContain('app.get("/api/admin/analytics/overview"');
    expect(SRC).toContain("activeUsers24h");
    expect(SRC).toContain("isSingleActiveUser: activeUsers24h === 1");
    expect(SRC).toContain("activeWindowHours: 24");
  });

  it("includes AI cost trend and runtime guardrail fields", () => {
    expect(SRC).toContain("eventType !== \"ai_request\"");
    expect(SRC).toContain("const aiCostTrend = Array.from({ length: 14 }");
    expect(SRC).toContain("aiCosts:");
    expect(SRC).toContain("aiRuntime:");
  });
});

