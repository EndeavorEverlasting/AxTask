import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Schema / migration parity guard.
 *
 * Protects the archetype analytics tables from two common regressions:
 *
 *  1. Someone renames / drops a column in `shared/schema.ts`. On the next
 *     `drizzle-kit push` (which production runs on deploy via Dockerfile &
 *     docker-compose.yml), that would issue a destructive `ALTER TABLE`
 *     against the rollup data.
 *  2. Someone edits `migrations/0019_archetype_empathy_analytics.sql` and
 *     accidentally drops the `IF NOT EXISTS` guards, making a re-run of
 *     `scripts/apply-migrations.mjs` fail after a filename change.
 *
 * Both failure modes are static-detectable from the source files; there is
 * no DB dependency here.
 */

const REPO_ROOT = join(__dirname, "..");

function read(relative: string): string {
  return readFileSync(join(REPO_ROOT, relative), "utf8");
}

const EXPECTED_ROLLUP_COLUMNS = [
  `varchar("id")`,
  `text("archetype_key")`,
  `text("bucket_date")`,
  `doublePrecision("empathy_score")`,
  `integer("samples")`,
  `jsonb("signals_json")`,
  `timestamp("computed_at")`,
];

const EXPECTED_MARKOV_COLUMNS = [
  `varchar("id")`,
  `text("from_archetype")`,
  `text("to_archetype")`,
  `text("bucket_date")`,
  `integer("count")`,
  `timestamp("computed_at")`,
];

const EXPECTED_ROLLUP_INDEXES = [
  "ux_archetype_rollup_daily_key_date",
  "idx_archetype_rollup_daily_date",
  "idx_archetype_rollup_daily_key",
];

const EXPECTED_MARKOV_INDEXES = [
  "ux_archetype_markov_daily_triple",
  "idx_archetype_markov_daily_date",
  "idx_archetype_markov_daily_from",
];

describe("archetype schema / migration parity", () => {
  // After the Phase F-1 split (docs/MODULE_LAYOUT.md) `shared/schema.ts` is a
  // barrel; the real declarations live under `shared/schema/*.ts`. Concatenate
  // all per-domain files so the static checks below still cover every table.
  const SCHEMA_SOURCES = [
    "shared/schema.ts",
    "shared/schema/core.ts",
    "shared/schema/tasks.ts",
    "shared/schema/gamification.ts",
    "shared/schema/ops.ts",
  ];
  const schema = SCHEMA_SOURCES.map((p) => read(p)).join("\n\n");
  const migration = read("migrations/0019_archetype_empathy_analytics.sql");

  describe("shared/schema.ts vs migration column lists", () => {
    it("archetypeRollupDaily declaration contains every expected column", () => {
      const block = sliceBlock(schema, "export const archetypeRollupDaily");
      for (const col of EXPECTED_ROLLUP_COLUMNS) {
        expect(block, `archetypeRollupDaily missing ${col}`).toContain(col);
      }
    });

    it("archetypeMarkovDaily declaration contains every expected column", () => {
      const block = sliceBlock(schema, "export const archetypeMarkovDaily");
      for (const col of EXPECTED_MARKOV_COLUMNS) {
        expect(block, `archetypeMarkovDaily missing ${col}`).toContain(col);
      }
    });

    it("archetypeRollupDaily declares all three expected indexes", () => {
      const block = sliceBlock(schema, "export const archetypeRollupDaily");
      for (const idx of EXPECTED_ROLLUP_INDEXES) {
        expect(block, `archetypeRollupDaily missing index ${idx}`).toContain(idx);
      }
    });

    it("archetypeMarkovDaily declares all three expected indexes", () => {
      const block = sliceBlock(schema, "export const archetypeMarkovDaily");
      for (const idx of EXPECTED_MARKOV_INDEXES) {
        expect(block, `archetypeMarkovDaily missing index ${idx}`).toContain(idx);
      }
    });
  });

  describe("migration idempotency", () => {
    it("every CREATE TABLE uses IF NOT EXISTS", () => {
      const matches = [...migration.matchAll(/CREATE\s+TABLE\s+(\S+)/gi)];
      expect(matches.length, "expected at least one CREATE TABLE").toBeGreaterThan(0);
      for (const m of matches) {
        const following = migration.slice(m.index ?? 0, (m.index ?? 0) + 80).toUpperCase();
        expect(following, `CREATE TABLE missing IF NOT EXISTS: ${m[0]}`).toContain(
          "IF NOT EXISTS",
        );
      }
    });

    it("every CREATE INDEX / UNIQUE INDEX uses IF NOT EXISTS", () => {
      const matches = [...migration.matchAll(/CREATE\s+(UNIQUE\s+)?INDEX\s+(\S+)/gi)];
      expect(matches.length, "expected at least one CREATE INDEX").toBeGreaterThan(0);
      for (const m of matches) {
        const following = migration.slice(m.index ?? 0, (m.index ?? 0) + 120).toUpperCase();
        expect(following, `CREATE INDEX missing IF NOT EXISTS: ${m[0]}`).toContain(
          "IF NOT EXISTS",
        );
      }
    });

    it("migration column names are a superset of the schema columns", () => {
      for (const sqlColumn of [
        "archetype_key text",
        "bucket_date text",
        "empathy_score double precision",
        "samples integer",
        "signals_json jsonb",
        "from_archetype text",
        "to_archetype text",
        "count integer",
      ]) {
        expect(migration, `migration missing column declaration: ${sqlColumn}`).toContain(
          sqlColumn,
        );
      }
    });

    it("migration defaults never include NULL for required JSON / counters", () => {
      expect(migration).toContain("signals_json jsonb NOT NULL DEFAULT");
      expect(migration).toContain("samples integer NOT NULL DEFAULT 0");
      expect(migration).toContain("count integer NOT NULL DEFAULT 0");
    });
  });
});

/**
 * Grab the source text for a single named export declaration block.
 * Uses `export const <name>` as the anchor and walks forward until the
 * matching top-level `]);` closer that ends `pgTable(...)`.
 */
function sliceBlock(source: string, anchor: string): string {
  const start = source.indexOf(anchor);
  if (start === -1) {
    throw new Error(`sliceBlock: anchor not found: ${anchor}`);
  }
  const tail = source.slice(start);
  const end = tail.indexOf("]);");
  if (end === -1) {
    throw new Error(`sliceBlock: could not find terminator for ${anchor}`);
  }
  return tail.slice(0, end + 3);
}
