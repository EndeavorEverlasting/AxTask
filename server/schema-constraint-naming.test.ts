// @vitest-environment node
/**
 * Guards against drift between Drizzle schema `.unique()` calls and raw SQL `UNIQUE`
 * in migrations/*.sql that causes drizzle-kit push to prompt "truncate table?" in
 * production (Render). See migrations/0015_rename_avatar_skill_key_unique.sql.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const migrationsDir = path.join(projectRoot, "migrations");

// After the Phase F-1 split (docs/MODULE_LAYOUT.md), declarations live under
// shared/schema/*.ts. Concatenate every file in the schema module graph so the
// text-based `.unique()` / `pgTable(...)` regexes still see every table.
const SCHEMA_SOURCES = [
  "shared/schema.ts",
  "shared/schema/core.ts",
  "shared/schema/tasks.ts",
  "shared/schema/gamification.ts",
  "shared/schema/ops.ts",
];
const schemaSrc = SCHEMA_SOURCES.map((rel) =>
  fs.readFileSync(path.join(projectRoot, rel), "utf8"),
).join("\n\n");

/** Strip block and line comments so we do not match string examples in doc comments. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("schema constraint naming guards", () => {
  it("every .unique() call in shared/schema.ts passes an explicit constraint name", () => {
    const src = stripComments(schemaSrc);
    // Match `.unique(` followed by whitespace and then either `)` (bad) or `"name"`.
    const bare = src.match(/\.unique\s*\(\s*\)/g) || [];
    expect(
      bare,
      "Every .unique() must use .unique(\"<name>\") to keep the constraint name stable across raw SQL migrations and drizzle-kit push introspection.",
    ).toEqual([]);
  });

  it("inline SQL column UNIQUE in migrations is not used on tables the Drizzle schema also declares as .unique()", () => {
    /**
     * Known historical inline UNIQUE occurrences that have already been corrected by a
     * later rename migration. Any new `${file}: ${table}.${column}` entry here MUST
     * have a paired rename migration; prefer adding `CONSTRAINT <name>_unique UNIQUE`
     * or a separate `ALTER TABLE ... ADD CONSTRAINT` in the originating migration.
     */
    const allowlist = new Set<string>([
      // Corrected by 0015_rename_avatar_skill_key_unique.sql.
      "0011_avatar_support_and_combo_chain.sql:avatar_skill_nodes.skill_key",
    ]);

    const drizzleUniqueColumns = new Map<string, Set<string>>();

    // Parse pgTable("table", { col: text("col").notNull().unique(...), ... })
    // Collect table -> columns that carry .unique() (with or without name).
    const tableRegex = /pgTable\s*\(\s*"([^"]+)"\s*,\s*\{([\s\S]*?)\}\s*(?:,|\))/g;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tableRegex.exec(schemaSrc)) !== null) {
      const tableName = tMatch[1];
      const body = tMatch[2];
      const colRegex = /\w+:\s*[a-zA-Z_]+\s*\(\s*"([^"]+)"[\s\S]*?\.unique\s*\(/g;
      let cMatch: RegExpExecArray | null;
      while ((cMatch = colRegex.exec(body)) !== null) {
        const col = cMatch[1];
        if (!drizzleUniqueColumns.has(tableName)) {
          drizzleUniqueColumns.set(tableName, new Set());
        }
        drizzleUniqueColumns.get(tableName)!.add(col);
      }
    }

    const sqlFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"));

    const violations: string[] = [];
    for (const file of sqlFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");

      const ctRegex =
        /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*\(([\s\S]*?)\);/gi;
      let cMatch: RegExpExecArray | null;
      while ((cMatch = ctRegex.exec(sql)) !== null) {
        const tableName = cMatch[1];
        const body = cMatch[2];
        const lines = body.split(/\n/);
        for (const line of lines) {
          const colMatch = line.match(/^\s*"([a-zA-Z_][a-zA-Z0-9_]*)"\s+[^,]*\bUNIQUE\b/);
          if (!colMatch) continue;
          const col = colMatch[1];
          if (!drizzleUniqueColumns.get(tableName)?.has(col)) continue;
          const key = `${file}:${tableName}.${col}`;
          if (allowlist.has(key)) continue;
          violations.push(
            `${key}: inline SQL UNIQUE on a column declared .unique() in shared/schema.ts. Use CONSTRAINT <name>_unique UNIQUE (<col>) so the auto-name matches drizzle's \`.unique("<name>_unique")\`.`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("migration 0015 renames avatar_skill_nodes_skill_key_key to avatar_skill_nodes_skill_key_unique idempotently", () => {
    const migration = fs.readFileSync(
      path.join(migrationsDir, "0015_rename_avatar_skill_key_unique.sql"),
      "utf8",
    );
    expect(migration).toContain("RENAME CONSTRAINT avatar_skill_nodes_skill_key_key");
    expect(migration).toContain("TO avatar_skill_nodes_skill_key_unique");
    expect(migration.toUpperCase()).toContain("IF EXISTS");
    expect(migration.toUpperCase()).toContain("NOT EXISTS");
  });

  it("Drizzle schema pins explicit constraint names for the three .unique() columns we rely on", () => {
    expect(schemaSrc).toContain('.unique("users_email_unique")');
    expect(schemaSrc).toContain('.unique("offline_skill_nodes_skill_key_unique")');
    expect(schemaSrc).toContain('.unique("avatar_skill_nodes_skill_key_unique")');
  });
});
