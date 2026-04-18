// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

/**
 * Archetype empathy analytics must never leak per-user data to API callers.
 * These tests inspect the source of the read API + rollup worker and assert
 * the privacy invariants documented in docs/ARCHETYPE_EMPATHY_ANALYTICS.md.
 */
describe("archetype empathy analytics — privacy contract", () => {
  const routesSrc = read("server/routes.ts");

  it("read API does not select actor_user_id / hashed_actor / payloadJson from DB", () => {
    // Extract the archetype read-API block by a simple marker slice.
    const start = routesSrc.indexOf("ARCHETYPE EMPATHY READ API");
    expect(start).toBeGreaterThan(-1);
    const block = routesSrc.slice(start, start + 6000);
    expect(block).not.toMatch(/actorUserId/);
    expect(block).not.toMatch(/hashedActor/);
    expect(block).not.toMatch(/payloadJson/);
    expect(block).not.toMatch(/signalsJson/);
    expect(block).not.toMatch(/\bsource\b\s*:/);
  });

  it("read API enforces k-anonymity threshold and scoped auth", () => {
    const start = routesSrc.indexOf("ARCHETYPE EMPATHY READ API");
    const block = routesSrc.slice(start, start + 6000);
    expect(block).toContain("ARCHETYPE_K_ANON_THRESHOLD");
    expect(block).toContain("requireArchetypeRead");
    expect(block).toContain("ARCHETYPE_READ_TOKEN");
  });

  it("recordArchetypeSignal does not persist actorUserId on the row", () => {
    const helper = read("server/lib/archetype-signal.ts");
    // The row write must intentionally omit actorUserId; the hashedActor goes
    // into the payload only.
    expect(helper).not.toMatch(/actorUserId\s*:\s*input\.userId/);
    expect(helper).toContain("Intentionally omit actorUserId");
    expect(helper).toContain('eventType: "archetype_signal"');
    expect(helper).toContain("hashedActor");
  });

  it("feedback ingest stamps archetype signal after processing", () => {
    expect(routesSrc).toContain("recordArchetypeSignal");
    expect(routesSrc).toMatch(/signal:\s*"feedback_submitted"/);
  });

  it("rollup worker never writes hashedActor or raw source downstream", () => {
    const worker = read("server/workers/archetype-rollup.ts");
    // The write paths to archetypeRollupDaily / archetypeMarkovDaily must not
    // include hashedActor or raw source fields in their INSERT values.
    const rollupInsert = worker.match(/db\.insert\(archetypeRollupDaily\)\.values\(\{[\s\S]*?\}\)/);
    expect(rollupInsert).toBeTruthy();
    expect(rollupInsert![0]).not.toMatch(/hashedActor/);
    expect(rollupInsert![0]).not.toMatch(/actorUserId/);
    expect(rollupInsert![0]).not.toMatch(/rawSource/);

    const markovInsert = worker.match(/db\.insert\(archetypeMarkovDaily\)\.values\(\{[\s\S]*?\}\)/);
    expect(markovInsert).toBeTruthy();
    expect(markovInsert![0]).not.toMatch(/hashedActor/);
    expect(markovInsert![0]).not.toMatch(/actorUserId/);
  });

  it("actor-hash helper fails closed in production", () => {
    const hash = read("server/lib/actor-hash.ts");
    expect(hash).toMatch(/NODE_ENV\s*===\s*"production"/);
    expect(hash).toContain("ARCHETYPE_ANALYTICS_SALT");
    expect(hash).toContain("required in production");
  });

  it("schema columns do not include a userId / actorUserId on rollup tables", () => {
    const schema = read("shared/schema.ts");
    const rollupBlock = schema.slice(
      schema.indexOf("archetypeRollupDaily = pgTable"),
      schema.indexOf("archetypeMarkovDaily = pgTable"),
    );
    expect(rollupBlock).not.toMatch(/actor_user_id|userId|hashed_actor/);

    const markovBlock = schema.slice(
      schema.indexOf("archetypeMarkovDaily = pgTable"),
      schema.indexOf("archetypeMarkovDaily = pgTable") + 800,
    );
    expect(markovBlock).not.toMatch(/actor_user_id|userId|hashed_actor/);
  });
});
