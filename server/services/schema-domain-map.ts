/**
 * SQL-table → domain (core / tasks / gamification / ops) map, derived at
 * module load from the Phase F-1 schema split under shared/schema/*. Used
 * by server/services/db-storage.ts to group per-table byte counts into
 * the same four domains the code lives in.
 *
 * The map is built reflectively from the Drizzle pgTable exports so new
 * tables added to any shared/schema/*.ts file show up here automatically
 * without needing to remember to touch another file. The contract test at
 * server/services/schema-domain-map.contract.test.ts walks the same
 * surface and fails if a declaration's domain assignment drifts.
 *
 * Pure helpers — `tableDomainMap` is a frozen snapshot so callers can
 * `Object.freeze`-trust it. All lookups are lowercase to avoid surprises
 * with Postgres `pg_stat_user_tables.relname` casing.
 */
import * as core from "@shared/schema/core";
import * as e2ee from "@shared/schema/e2ee";
import * as tasks from "@shared/schema/tasks";
import * as gamification from "@shared/schema/gamification";
import * as ops from "@shared/schema/ops";

export const SCHEMA_DOMAINS = ["core", "tasks", "gamification", "ops"] as const;
export type SchemaDomain = (typeof SCHEMA_DOMAINS)[number];
export type SchemaDomainOrUnknown = SchemaDomain | "unknown";

const DRIZZLE_IS_TABLE = Symbol.for("drizzle:IsDrizzleTable");
// Drizzle stashes the SQL name of a pgTable under this Symbol. Going
// through the Symbol instead of scraping source keeps the map correct
// even when the JS export name diverges from the SQL table name.
const DRIZZLE_NAME = Symbol.for("drizzle:Name");

function extractTables(
  domain: SchemaDomain,
  moduleNamespace: Record<string, unknown>,
): Array<{ tableName: string; domain: SchemaDomain }> {
  const out: Array<{ tableName: string; domain: SchemaDomain }> = [];
  for (const value of Object.values(moduleNamespace)) {
    if (
      value &&
      typeof value === "object" &&
      DRIZZLE_IS_TABLE in value
    ) {
      const rawName = (value as Record<symbol, unknown>)[DRIZZLE_NAME];
      if (typeof rawName === "string" && rawName.length > 0) {
        out.push({ tableName: rawName.toLowerCase(), domain });
      }
    }
  }
  return out;
}

function buildDomainMap(): Readonly<Record<string, SchemaDomain>> {
  const rows: Array<{ tableName: string; domain: SchemaDomain }> = [];
  rows.push(...extractTables("core", core as unknown as Record<string, unknown>));
  rows.push(...extractTables("core", e2ee as unknown as Record<string, unknown>));
  rows.push(...extractTables("tasks", tasks as unknown as Record<string, unknown>));
  rows.push(
    ...extractTables("gamification", gamification as unknown as Record<string, unknown>),
  );
  rows.push(...extractTables("ops", ops as unknown as Record<string, unknown>));

  const map: Record<string, SchemaDomain> = {};
  for (const { tableName, domain } of rows) {
    // A table should only ever belong to one domain; if two files both
    // re-export the same pgTable we'd rather fail loudly here than let
    // the storage-tab rollup silently double-count bytes.
    if (map[tableName] && map[tableName] !== domain) {
      throw new Error(
        `[schema-domain-map] table "${tableName}" is claimed by both ` +
          `"${map[tableName]}" and "${domain}". Fix the duplicate export in ` +
          `shared/schema/*.ts.`,
      );
    }
    map[tableName] = domain;
  }
  return Object.freeze(map);
}

export const tableDomainMap: Readonly<Record<string, SchemaDomain>> =
  buildDomainMap();

/**
 * Look up the domain for a SQL table name. Unknown tables fall into
 * the "unknown" bucket so the storage tab can still show them under a
 * catch-all rather than silently dropping bytes.
 */
export function domainOfTable(sqlTableName: string): SchemaDomainOrUnknown {
  if (!sqlTableName) return "unknown";
  return tableDomainMap[sqlTableName.toLowerCase()] ?? "unknown";
}

/**
 * All known table names, lowercase. Useful for contract tests that want
 * to iterate the full inventory without re-reflecting.
 */
export function listKnownTables(): ReadonlyArray<string> {
  return Object.freeze(Object.keys(tableDomainMap).sort());
}
