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
    expect(src).toContain("urgency_recalculate_rating_reward");
    expect(src).toContain("classification_consensus_tier_bonus");
    expect(src).toContain("feedback_submission_reward");
    expect(src).toContain("classification_correction_consensus_reward");
  });

  it("wires task create, update, search, and recalculate responses", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain("uniqueTaskReward");
    expect(routes).toContain("coinSkipReason");
    expect(routes).toContain("walletBalance");
    expect(routes).toContain("hasTaskBeenAwarded");
    expect(routes).toContain("completionCoinSkipReason");
    expect(routes).toContain("ENGAGEMENT.taskSearch");
    expect(routes).toContain("recalculateReward");
    expect(routes).toContain('"/api/tasks/recalculate/rating"');
    expect(routes).toContain('"/api/gamification/economy-diagnostics"');
    expect(routes).toContain("consensusCorrectionReward");
    expect(routes).toContain("consensusTierBonus");
    expect(routes).toContain("confirmationCount");
  });

  it("returns classification confirmation response with new balance", () => {
    const src = fs.readFileSync(path.join(root, "server", "classification-confirm.ts"), "utf8");
    expect(src).toContain("newBalance");
    expect(src).toContain("getOrCreateWallet");
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

  it("wires chip hunt sync and redacted badge definitions", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    const dtos = fs.readFileSync(path.join(root, "shared", "public-client-dtos.ts"), "utf8");
    expect(routes).toContain('app.post("/api/gamification/chip-hunt/sync"');
    expect(routes).toContain("toPublicBadgeDefinitions");
    expect(dtos).toContain("toPublicBadgeDefinitions");
  });

  it("keeps multi-label confidence visible across UI and route updates", () => {
    const badgeUi = fs.readFileSync(
      path.join(root, "client", "src", "components", "classification-badge.tsx"),
      "utf8",
    );
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(badgeUi).toContain("Multi-label confidence");
    expect(badgeUi).toContain("classificationAssociations");
    expect(routes).toContain("classifyWithAssociations");
    expect(routes).toContain("classificationAssociations");
  });
});
