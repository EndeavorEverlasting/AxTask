// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

describe("use-case engagement wiring", () => {
  it("exports capped engagement rewards module", () => {
    const src = fs.readFileSync(path.join(root, "server", "engagement-rewards.ts"), "utf8");
    expect(src).toContain("tryCappedCoinAward");
    expect(src).toContain("unique_task_create");
    expect(src).toContain("task_search_reward");
    expect(src).toContain("priority_recalculate_reward");
  });

  it("wires task create, update, search, and recalculate responses", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain("uniqueTaskReward");
    expect(routes).toContain("coinSkipReason");
    expect(routes).toContain("ENGAGEMENT.taskSearch");
    expect(routes).toContain("recalculateReward");
  });

  it("wires task list to server search for engagement coins", () => {
    const taskList = fs.readFileSync(
      path.join(root, "client", "src", "components", "task-list.tsx"),
      "utf8",
    );
    expect(taskList).toContain("resolveTaskListSearchSource");
    expect(taskList).toContain('"/api/tasks/search"');
    expect(taskList).toContain("encodeURIComponent");
  });
});
