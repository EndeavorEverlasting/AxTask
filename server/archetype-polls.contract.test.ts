// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("archetype polls — contract", () => {
  const routesSrc = read("server/routes.ts");
  const schemaSrc = read("shared/schema/ops.ts");
  const migrationSrc = read("migrations/0025_archetype_polls.sql");

  it("schema declares archetype poll tables and vote uniqueness", () => {
    expect(schemaSrc).toContain('pgTable("archetype_polls"');
    expect(schemaSrc).toContain('pgTable("archetype_poll_options"');
    expect(schemaSrc).toContain('pgTable("archetype_poll_votes"');
    expect(schemaSrc).toContain('uniqueIndex("ux_archetype_poll_votes_poll_user").on(table.pollId, table.userId)');
  });

  it("migration creates archetype poll tables idempotently", () => {
    expect(migrationSrc).toContain("CREATE TABLE IF NOT EXISTS archetype_polls");
    expect(migrationSrc).toContain("CREATE TABLE IF NOT EXISTS archetype_poll_options");
    expect(migrationSrc).toContain("CREATE TABLE IF NOT EXISTS archetype_poll_votes");
    expect(migrationSrc).toContain("ux_archetype_poll_votes_poll_user");
  });

  it("routes register public poll list, detail, my-vote, and authenticated vote", () => {
    expect(routesSrc).toContain('app.get("/api/public/community/polls"');
    expect(routesSrc).toContain('app.get("/api/public/community/polls/:id"');
    expect(routesSrc).toContain('app.get("/api/public/community/polls/:id/my-vote"');
    expect(routesSrc).toContain('app.post("/api/public/community/polls/:id/vote"');
    const voteIdx = routesSrc.indexOf('app.post("/api/public/community/polls/:id/vote"');
    expect(routesSrc.slice(voteIdx, voteIdx + 120)).toMatch(/requireAuth/);
  });

  it("vote handler records hashedActor and omits actorUserId on security event", () => {
    const idx = routesSrc.indexOf('app.post("/api/public/community/polls/:id/vote"');
    expect(idx).toBeGreaterThan(-1);
    const block = routesSrc.slice(idx, idx + 2200);
    expect(block).toContain('eventType: "archetype_poll_vote"');
    expect(block).toMatch(/hashedActor:\s*hashActor\(req\.user!\.id\)/);
    expect(block).not.toMatch(/actorUserId:\s*req\.user!\.id/);
  });

  it("poll engine is invoked on startup", () => {
    expect(routesSrc).toContain("ensureArchetypePollSchedule");
    expect(routesSrc).toContain("AXTASK_ARCHETYPE_POLL_SCHEDULER");
  });

  it("public poll detail handler does not touch session user", () => {
    const idx = routesSrc.indexOf('app.get("/api/public/community/polls/:id"');
    expect(idx).toBeGreaterThan(-1);
    const block = routesSrc.slice(idx, idx + 1200);
    expect(block).toContain("toPublicArchetypePollSummary");
    expect(block).toContain("res.json");
    expect(block).not.toContain("req.user");
  });

  it("admin can create polls with step-up", () => {
    expect(routesSrc).toContain('app.post("/api/admin/archetype-polls"');
    const idx = routesSrc.indexOf('app.post("/api/admin/archetype-polls"');
    const block = routesSrc.slice(idx, idx + 400);
    expect(block).toMatch(/requireAdmin/);
    expect(block).toMatch(/requireAdminStepUp/);
  });
});
