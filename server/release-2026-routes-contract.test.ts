// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");

describe("release-2026-04-15 contracts", () => {
  it("exposes classification confirmation HTTP routes", () => {
    const routes = fs.readFileSync(path.join(projectRoot, "server", "routes.ts"), "utf8");
    expect(routes).toContain('app.get("/api/tasks/:id/classifications"');
    expect(routes).toContain('app.post("/api/tasks/:id/confirm-classification"');
  });

  it("ships SQL migration for associations + confirmations table", () => {
    const sql = fs.readFileSync(
      path.join(projectRoot, "migrations", "0008_classification_associations_confirmations.sql"),
      "utf8",
    );
    expect(sql).toContain("classification_associations");
    expect(sql).toContain("task_classification_confirmations");
  });

  it("ships user custom classification labels migration", () => {
    const sql = fs.readFileSync(
      path.join(projectRoot, "migrations", "0009_user_classification_labels.sql"),
      "utf8",
    );
    expect(sql).toContain("user_classification_labels");
  });

  it("exposes classification categories + suggestions HTTP routes", () => {
    const routes = fs.readFileSync(path.join(projectRoot, "server", "routes.ts"), "utf8");
    expect(routes).toContain('app.get("/api/classification/categories"');
    expect(routes).toContain('app.post("/api/classification/categories"');
    expect(routes).toContain('app.post("/api/classification/suggestions"');
  });

  it("completion awards skip when task was already rewarded (ledger guard)", () => {
    const engine = fs.readFileSync(path.join(projectRoot, "server", "coin-engine.ts"), "utf8");
    expect(engine).toContain("hasTaskBeenAwarded");
    expect(engine).toContain("task_completion");
  });

  it("refetches task from storage before completion coin award on PUT /api/tasks/:id", () => {
    const routes = fs.readFileSync(path.join(projectRoot, "server", "routes.ts"), "utf8");
    const refetch = routes.indexOf("const latestTask = await storage.getTask(userId, req.params.id)");
    const award = routes.indexOf("awardCoinsForCompletion(userId, task!, previousStatus)");
    expect(refetch).toBeGreaterThan(-1);
    expect(award).toBeGreaterThan(refetch);
  });

  it("2026-04-18 expansion: public momentum, thumbs, collab, and migration DDL", () => {
    const routes = fs.readFileSync(path.join(projectRoot, "server", "routes.ts"), "utf8");
    expect(routes).toContain('app.get("/api/public/community/momentum"');
    expect(routes).toContain('app.get("/api/tasks/:id/classification-thumb"');
    expect(routes).toContain('app.post("/api/tasks/:id/classification-thumb"');
    expect(routes).toContain('app.get("/api/collaboration/inbox"');
    expect(routes).toContain('app.get("/api/alarm-snapshots"');
    expect(routes).toContain('app.get("/api/admin/repo-inventory"');
    const sql = fs.readFileSync(
      path.join(projectRoot, "migrations", "0016_expansion_2026_04_18.sql"),
      "utf8",
    );
    expect(sql).toContain("task_classification_thumbs");
    expect(sql).toContain("unlock_at_avatar_level");
  });

  it("2026 shop sell-back + productivity exports + owner grant routes", () => {
    const routes = fs.readFileSync(path.join(projectRoot, "server", "routes.ts"), "utf8");
    expect(routes).toContain('app.get("/api/gamification/productivity-export-prices"');
    expect(routes).toContain('app.post("/api/gamification/rewards/sell-back"');
    expect(routes).toContain('app.post("/api/gamification/owner/grant-coins"');
    expect(routes).toContain('app.post("/api/checklist/:date/download"');
    expect(routes).toContain('app.post("/api/tasks/export/spreadsheet"');
    expect(routes).toContain('app.post("/api/tasks/:taskId/report"');
    const sql = fs.readFileSync(
      path.join(projectRoot, "migrations", "0017_user_rewards_coins_spent.sql"),
      "utf8",
    );
    expect(sql).toContain("coins_spent_at_redeem");
  });
});
