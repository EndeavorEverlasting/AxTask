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
    expect(src).toContain("daily_login_reward");
    expect(src).toContain("hourly_login_reward");
    expect(src).toContain("organization_filter_followthrough_reward");
    expect(src).toContain("organization_aptitude_points");
    expect(src).toContain("priority_recalculate_reward");
    expect(src).toContain("urgency_recalculate_rating_reward");
    expect(src).toContain("classification_consensus_tier_bonus");
    expect(src).toContain("feedback_submission_reward");
    expect(src).toContain("classification_correction_consensus_reward");
    expect(src).toContain("archetype_poll_vote_reward");
    expect(src).toContain("archetypePollVote");
  });

  it("wires task create, update, search, and recalculate responses", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain("uniqueTaskReward");
    expect(routes).toContain("coinSkipReason");
    expect(routes).toContain("walletBalance");
    expect(routes).toContain("hasTaskBeenAwarded");
    expect(routes).toContain("completionCoinSkipReason");
    expect(routes).toContain("ENGAGEMENT.taskSearch");
    expect(routes).toContain('"/api/tasks/filter-intent"');
    expect(routes).toContain("maybeAwardOrganizationFollowthrough");
    expect(routes).toContain("awardLoginRewards");
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
    /* Migrated from `task-list.tsx` → `task-list-host.tsx` in pass 3.
     * The host fires a debounced beacon to /api/tasks/search so users
     * keep earning the capped `task_search_reward` coin even though
     * the host filters client-side for instant narrowing. */
    const taskListHost = fs.readFileSync(
      path.join(root, "client", "src", "components", "task-list-host.tsx"),
      "utf8",
    );
    expect(taskListHost).toContain("/api/tasks/search/");
    expect(taskListHost).toContain("encodeURIComponent");
  });

  it("wires OAuth login completion helper with login reward engine", () => {
    const authTotpLogin = fs.readFileSync(path.join(root, "server", "auth-totp-login.ts"), "utf8");
    expect(authTotpLogin).toContain("awardLoginRewards");
  });

  it("wires bulk task review complete with organization follow-through rewards", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain('app.post("/api/tasks/review/apply"');
    expect(routes).toMatch(/app\.post\("\/api\/tasks\/review\/apply"[\s\S]*case "complete":[\s\S]*maybeAwardOrganizationFollowthrough/);
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
