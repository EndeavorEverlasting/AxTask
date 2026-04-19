// @vitest-environment node
import { describe, it, expect } from "vitest";

import * as barrel from "@shared/schema";
import * as core from "@shared/schema/core";
import * as tasks from "@shared/schema/tasks";
import * as gamification from "@shared/schema/gamification";
import * as ops from "@shared/schema/ops";

import {
  tableDomainMap,
  domainOfTable,
  listKnownTables,
  SCHEMA_DOMAINS,
  type SchemaDomain,
} from "./schema-domain-map";

/**
 * Contract test for the Phase F-1 schema-domain mapping. Protects the
 * Admin > Storage rollup from silent drift: when a new pgTable lands in
 * any shared/schema/*.ts file, it *must* be reachable from the map, and
 * it *must* be assigned to the domain file that declared it.
 */
const DRIZZLE_IS_TABLE = Symbol.for("drizzle:IsDrizzleTable");
const DRIZZLE_NAME = Symbol.for("drizzle:Name");

function tablesIn(ns: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const value of Object.values(ns)) {
    if (value && typeof value === "object" && DRIZZLE_IS_TABLE in value) {
      const name = (value as Record<symbol, unknown>)[DRIZZLE_NAME];
      if (typeof name === "string") out.push(name);
    }
  }
  return out.sort();
}

describe("schema-domain-map Phase F-1 contract", () => {
  const coreTables = tablesIn(core as unknown as Record<string, unknown>);
  const taskTables = tablesIn(tasks as unknown as Record<string, unknown>);
  const gameTables = tablesIn(gamification as unknown as Record<string, unknown>);
  const opsTables = tablesIn(ops as unknown as Record<string, unknown>);
  const barrelTables = tablesIn(barrel as unknown as Record<string, unknown>);

  it("knows about every Drizzle table reachable from @shared/schema", () => {
    const known = new Set(listKnownTables());
    const missing = barrelTables.filter((t) => !known.has(t.toLowerCase()));
    expect(missing).toEqual([]);
  });

  it("assigns every core table to the 'core' domain", () => {
    for (const t of coreTables) {
      expect({ table: t, domain: domainOfTable(t) }).toEqual({ table: t, domain: "core" });
    }
  });

  it("assigns every tasks table to the 'tasks' domain", () => {
    for (const t of taskTables) {
      expect({ table: t, domain: domainOfTable(t) }).toEqual({ table: t, domain: "tasks" });
    }
  });

  it("assigns every gamification table to the 'gamification' domain", () => {
    for (const t of gameTables) {
      expect({ table: t, domain: domainOfTable(t) }).toEqual({ table: t, domain: "gamification" });
    }
  });

  it("assigns every ops table to the 'ops' domain", () => {
    for (const t of opsTables) {
      expect({ table: t, domain: domainOfTable(t) }).toEqual({ table: t, domain: "ops" });
    }
  });

  it("returns 'unknown' for tables not in any shared/schema file", () => {
    expect(domainOfTable("pg_stat_user_tables")).toBe("unknown");
    expect(domainOfTable("definitely_not_in_schema_xyz")).toBe("unknown");
    expect(domainOfTable("")).toBe("unknown");
  });

  it("lowercases lookups so pg_stat_user_tables.relname casing is handled", () => {
    // Pick an arbitrary core table and uppercase it; the map should still hit.
    if (coreTables.length > 0) {
      const t = coreTables[0];
      expect(domainOfTable(t.toUpperCase())).toBe("core");
    }
  });

  it("SCHEMA_DOMAINS is the frozen set of four phase F-1 domains", () => {
    expect([...SCHEMA_DOMAINS].sort()).toEqual(
      ["core", "gamification", "ops", "tasks"] satisfies SchemaDomain[],
    );
  });

  it("tableDomainMap is frozen so accidental mutation is rejected at runtime", () => {
    expect(Object.isFrozen(tableDomainMap)).toBe(true);
  });

  it("every table is claimed by exactly one domain", () => {
    const seen = new Map<string, string[]>();
    const buckets: Array<[string, string[]]> = [
      ["core", coreTables.map((t) => t.toLowerCase())],
      ["tasks", taskTables.map((t) => t.toLowerCase())],
      ["gamification", gameTables.map((t) => t.toLowerCase())],
      ["ops", opsTables.map((t) => t.toLowerCase())],
    ];
    for (const [domain, list] of buckets) {
      for (const t of list) {
        const owners = seen.get(t) ?? [];
        owners.push(domain);
        seen.set(t, owners);
      }
    }
    const multiClaim = [...seen.entries()].filter(([, owners]) => owners.length > 1);
    expect(multiClaim).toEqual([]);
  });
});
