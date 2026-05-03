// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

describe("planner grocery contracts", () => {
  it("planner briefing includes shopping bucket and repurchaseSuggestions", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain('app.get("/api/planner/briefing"');
    expect(routes).toContain("shopping: {");
    expect(routes).toContain("repurchaseSuggestions");
  });

  it("grocery suggest endpoint exists and supports opt-in automation", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain('app.post("/api/grocery-reminders/suggest"');
    expect(routes).toContain("applyOptInAutomation");
    expect(routes).toContain("groceryAutoCreateTaskEnabled");
    expect(routes).toContain("groceryAutoNotifyEnabled");
  });
});
