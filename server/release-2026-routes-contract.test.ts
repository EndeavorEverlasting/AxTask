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

  it("completion awards skip when task was already rewarded (ledger guard)", () => {
    const engine = fs.readFileSync(path.join(projectRoot, "server", "coin-engine.ts"), "utf8");
    expect(engine).toContain("hasTaskBeenAwarded");
    expect(engine).toContain("task_completion");
  });
});
