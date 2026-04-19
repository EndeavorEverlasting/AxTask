// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

/**
 * Classification-dispute / category-review-trigger contract.
 *
 * Static-analysis style test (same shape as archetype-privacy.contract.test.ts)
 * — asserts source invariants across schema, storage, routes, and the idempotent
 * SQL migration rather than spinning up a live DB. Live integration coverage
 * lives on top of the storage layer in other suites once main's integration
 * harness is wired.
 *
 * Covered invariants (see c:\Users\Cheex\.cursor\plans\classification_disputes_port_ca461404.plan.md):
 *   1. Threshold boundary: >=5 disputes + >=70% agreement -> review_needed.
 *   2. Unique constraints: one dispute per user per task; one vote per user per dispute.
 *   3. Admin gate: resolve endpoint protected by requireAdmin + requireAdminStepUp.
 *   4. Security log: admin resolve calls logSecurityEvent("classification_category_resolved").
 *   5. Privacy: dispute events never persist actorUserId; hashedActor in payload.
 *   6. Idempotent migration: CREATE TABLE IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT EXISTS.
 */
describe("classification disputes — contract", () => {
  const schemaSrc = read("shared/schema.ts");
  const storageSrc = read("server/storage.ts");
  const routesSrc = read("server/routes.ts");
  const migrationSrc = read("migrations/0022_classification_disputes.sql");

  it("schema declares classification_disputes with task/user FKs and one-dispute-per-user uniqueness", () => {
    expect(schemaSrc).toContain('pgTable("classification_disputes"');
    expect(schemaSrc).toMatch(/taskId:\s*varchar\("task_id"\)[\s\S]*?references\(\(\) => tasks\.id/);
    expect(schemaSrc).toMatch(/userId:\s*varchar\("user_id"\)[\s\S]*?references\(\(\) => users\.id/);
    expect(schemaSrc).toContain('uniqueIndex("ux_class_dispute_task_user").on(table.taskId, table.userId)');
  });

  it("schema declares classification_dispute_votes with one-vote-per-user uniqueness", () => {
    expect(schemaSrc).toContain('pgTable("classification_dispute_votes"');
    expect(schemaSrc).toContain('uniqueIndex("ux_class_dispute_votes_user_dispute").on(table.userId, table.disputeId)');
  });

  it("schema declares category_review_triggers with (originalCategory, suggestedCategory) uniqueness and status default", () => {
    expect(schemaSrc).toContain('pgTable("category_review_triggers"');
    expect(schemaSrc).toContain('uniqueIndex("ux_crt_category_pair").on(table.originalCategory, table.suggestedCategory)');
    expect(schemaSrc).toMatch(/status:\s*text\("status"\).*\.default\("monitoring"\)/);
    expect(schemaSrc).toMatch(/CATEGORY_REVIEW_STATUSES\s*=\s*\["monitoring",\s*"contested",\s*"review_needed",\s*"resolved"\]/);
  });

  it("storage.updateCategoryReviewTracker enforces the 5-dispute / 70%-agreement threshold boundary", () => {
    expect(storageSrc).toContain("DISPUTE_REVIEW_MIN_DISPUTES = 5");
    expect(storageSrc).toMatch(/DISPUTE_REVIEW_AGREEMENT_RATIO\s*=\s*0\.7/);
    expect(storageSrc).toMatch(
      /disputeCount\s*>=\s*DISPUTE_REVIEW_MIN_DISPUTES\s*&&\s*consensusRatio\s*>=\s*DISPUTE_REVIEW_AGREEMENT_RATIO/,
    );
    expect(storageSrc).toMatch(/status\s*=\s*"review_needed"/);
    expect(storageSrc).toMatch(/status\s*=\s*"contested"/);
    expect(storageSrc).toMatch(/status\s*=\s*"monitoring"/);
  });

  it("storage.voteOnDispute toggles an existing row (upsert) rather than inserting duplicates", () => {
    const idx = storageSrc.indexOf("export async function voteOnDispute");
    expect(idx).toBeGreaterThan(-1);
    const block = storageSrc.slice(idx, idx + 1200);
    expect(block).toContain("getUserVoteOnDispute");
    expect(block).toMatch(/if \(existing\)/);
    expect(block).toContain(".update(classificationDisputeVotes)");
    expect(block).toContain(".insert(classificationDisputeVotes)");
  });

  it("routes register the public dispute, vote, and admin resolve endpoints", () => {
    expect(routesSrc).toContain('app.post("/api/tasks/:taskId/classification/disputes"');
    expect(routesSrc).toContain('app.get("/api/tasks/:taskId/classification/disputes"');
    expect(routesSrc).toContain('app.post("/api/classification/disputes/:disputeId/vote"');
    expect(routesSrc).toContain('app.get("/api/classification/disputes/:disputeId/votes"');
    expect(routesSrc).toContain('app.get("/api/admin/classification/category-review-triggers"');
    expect(routesSrc).toContain('app.post("/api/admin/classification/category-review-triggers/:id/resolve"');
  });

  it("admin resolve endpoint is gated by requireAdmin + requireAdminStepUp and writes a security log", () => {
    const idx = routesSrc.indexOf('app.post("/api/admin/classification/category-review-triggers/:id/resolve"');
    expect(idx).toBeGreaterThan(-1);
    const block = routesSrc.slice(idx, idx + 1400);
    expect(block).toContain("requireAdmin");
    expect(block).toContain("requireAdminStepUp");
    expect(block).toMatch(/logSecurityEvent\(\s*"classification_category_resolved"/);
  });

  it("dispute create + vote endpoints emit archetype-style security events with hashedActor (no actorUserId)", () => {
    const createIdx = routesSrc.indexOf('app.post("/api/tasks/:taskId/classification/disputes"');
    const createBlock = routesSrc.slice(createIdx, createIdx + 2200);
    expect(createBlock).toContain('eventType: "classification_dispute_created"');
    expect(createBlock).toMatch(/hashedActor:\s*hashActor\(req\.user!\.id\)/);
    expect(createBlock).not.toMatch(/actorUserId:\s*req\.user!\.id/);

    const voteIdx = routesSrc.indexOf('app.post("/api/classification/disputes/:disputeId/vote"');
    const voteBlock = routesSrc.slice(voteIdx, voteIdx + 1800);
    expect(voteBlock).toContain('eventType: "classification_dispute_vote"');
    expect(voteBlock).toMatch(/hashedActor:\s*hashActor\(req\.user!\.id\)/);
    expect(voteBlock).not.toMatch(/actorUserId:\s*req\.user!\.id/);
  });

  it("dispute create rejects self-dispute on already-dispute and mismatched originalCategory", () => {
    const idx = routesSrc.indexOf('app.post("/api/tasks/:taskId/classification/disputes"');
    const block = routesSrc.slice(idx, idx + 2200);
    expect(block).toMatch(/Suggested category must differ from original/);
    expect(block).toMatch(/Task classification has changed/);
    expect(block).toMatch(/already disputed this classification/);
  });

  it("vote endpoint blocks users from voting on their own disputes", () => {
    const idx = routesSrc.indexOf('app.post("/api/classification/disputes/:disputeId/vote"');
    const block = routesSrc.slice(idx, idx + 1800);
    expect(block).toMatch(/cannot vote on your own dispute/);
  });

  it("migration 0022 is idempotent (IF NOT EXISTS) and covers all three tables + unique indexes", () => {
    expect(migrationSrc).toContain("CREATE TABLE IF NOT EXISTS classification_disputes");
    expect(migrationSrc).toContain("CREATE TABLE IF NOT EXISTS classification_dispute_votes");
    expect(migrationSrc).toContain("CREATE TABLE IF NOT EXISTS category_review_triggers");
    expect(migrationSrc).toContain("CREATE UNIQUE INDEX IF NOT EXISTS ux_class_dispute_task_user");
    expect(migrationSrc).toContain("CREATE UNIQUE INDEX IF NOT EXISTS ux_class_dispute_votes_user_dispute");
    expect(migrationSrc).toContain("CREATE UNIQUE INDEX IF NOT EXISTS ux_crt_category_pair");
  });

  it("dispute endpoints do not emit a coin reward (neutrality: explicit non-goal of this PR)", () => {
    const createIdx = routesSrc.indexOf('app.post("/api/tasks/:taskId/classification/disputes"');
    const createBlock = routesSrc.slice(createIdx, createIdx + 2200);
    const voteIdx = routesSrc.indexOf('app.post("/api/classification/disputes/:disputeId/vote"');
    const voteBlock = routesSrc.slice(voteIdx, voteIdx + 1800);
    for (const block of [createBlock, voteBlock]) {
      expect(block).not.toMatch(/awardCoinsFor/);
      expect(block).not.toMatch(/addCoins\(/);
      expect(block).not.toMatch(/tryCappedCoinAward\(/);
    }
  });
});
