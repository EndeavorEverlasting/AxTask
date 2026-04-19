import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import * as barrel from "./index";
import * as schemaEntry from "../schema";
import * as core from "./core";
import * as tasksDomain from "./tasks";
import * as gamification from "./gamification";
import * as ops from "./ops";

/**
 * Phase F-1 contract: the per-domain schema split must preserve every public
 * symbol that used to live in the monolithic `shared/schema.ts`. The reference
 * list under `__fixtures__/public-symbols.json` is frozen at the split point;
 * any drift (symbol removed, renamed, or an intended addition that wasn't
 * registered with docs/MODULE_LAYOUT.md) fails here loudly.
 *
 * If the failure is intentional (new table, deliberate rename), regenerate the
 * fixture with:
 *   npx tsx -e "import('./shared/schema').then(m => \
 *     console.log(JSON.stringify(Object.keys(m).sort(), null, 2)))" \
 *     > shared/schema/__fixtures__/public-symbols.json
 */
describe("shared/schema Phase F-1 split", () => {
  const fixturePath = resolve(__dirname, "__fixtures__/public-symbols.json");
  const expectedSymbols: string[] = JSON.parse(readFileSync(fixturePath, "utf8"));

  it("barrel exposes exactly the frozen public symbol inventory", () => {
    const actual = Object.keys(barrel).sort();
    expect(actual).toEqual(expectedSymbols);
  });

  it("`@shared/schema` re-exports the barrel verbatim (back-compat for ~90 callers)", () => {
    const entryKeys = Object.keys(schemaEntry).sort();
    const barrelKeys = Object.keys(barrel).sort();
    expect(entryKeys).toEqual(barrelKeys);
  });

  it("shared/schema.ts is a thin re-export (no declarations leak back into the monolith)", () => {
    const source = readFileSync(
      resolve(__dirname, "..", "schema.ts"),
      "utf8",
    );
    // Strip comment lines so the assertion is stable against doc edits.
    const nonComment = source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("//") && !line.startsWith("*") && !line.startsWith("/*"));
    // Anything other than the barrel re-export would regrow the monolith.
    expect(nonComment).toEqual([`export * from "./schema/index";`]);
  });

  describe("domain files own disjoint subsets of the public surface", () => {
    const perDomain: Record<string, Set<string>> = {
      core: new Set(Object.keys(core)),
      tasks: new Set(Object.keys(tasksDomain)),
      gamification: new Set(Object.keys(gamification)),
      ops: new Set(Object.keys(ops)),
    };

    it("every barrel symbol comes from exactly one domain file", () => {
      const barrelKeys = Object.keys(barrel);
      const unownedOrShared = barrelKeys.filter((key) => {
        const owners = Object.entries(perDomain).filter(([, set]) => set.has(key));
        return owners.length !== 1;
      });
      expect(unownedOrShared).toEqual([]);
    });
  });

  describe("module-cycle guardrails", () => {
    /**
     * Strip line and block comments so negative assertions don't trip on
     * comment prose that mentions forbidden import paths verbatim (e.g.
     * "Do NOT import from \"./ops\" here"). We only care about real
     * `import ... from "..."` statements.
     */
    const readSourceWithoutComments = (relPath: string): string => {
      const raw = readFileSync(resolve(__dirname, relPath), "utf8");
      return raw
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split(/\r?\n/)
        .map((line) => {
          const idx = line.indexOf("//");
          return idx === -1 ? line : line.slice(0, idx);
        })
        .join("\n");
    };

    it("core.ts does not depend on any other schema file", () => {
      const src = readSourceWithoutComments("core.ts");
      expect(src).not.toMatch(/from\s+["']\.\/tasks["']/);
      expect(src).not.toMatch(/from\s+["']\.\/gamification["']/);
      expect(src).not.toMatch(/from\s+["']\.\/ops["']/);
    });

    it("tasks.ts imports only from ./core", () => {
      const src = readSourceWithoutComments("tasks.ts");
      expect(src).toMatch(/from\s+["']\.\/core["']/);
      expect(src).not.toMatch(/from\s+["']\.\/gamification["']/);
      expect(src).not.toMatch(/from\s+["']\.\/ops["']/);
    });

    it("gamification.ts imports only from ./core", () => {
      const src = readSourceWithoutComments("gamification.ts");
      expect(src).toMatch(/from\s+["']\.\/core["']/);
      expect(src).not.toMatch(/from\s+["']\.\/tasks["']/);
      expect(src).not.toMatch(/from\s+["']\.\/ops["']/);
    });

    it("ops.ts depends on ./core and ./tasks, never ./gamification", () => {
      const src = readSourceWithoutComments("ops.ts");
      expect(src).toMatch(/from\s+["']\.\/core["']/);
      expect(src).toMatch(/from\s+["']\.\/tasks["']/);
      expect(src).not.toMatch(/from\s+["']\.\/gamification["']/);
    });
  });

  describe("Drizzle-kit discovery surface", () => {
    it("every pgTable from the reference inventory is also exposed as a runtime value", () => {
      // drizzle.config.ts still points at ./shared/schema.ts; the tablesFilter
      // relies on every table being reachable from the barrel. If a table is
      // accidentally type-only-exported (e.g. `export type Foo = ...` without
      // `export const foo = pgTable(...)`) the row wouldn't appear at runtime
      // and drizzle-kit push / apply-migrations would silently skip it.
      const pgTables = expectedSymbols.filter((name) => {
        const value = (barrel as Record<string, unknown>)[name];
        return (
          value &&
          typeof value === "object" &&
          // drizzle sets a Symbol("drizzle:Name") on tables; easier to check
          // for the .$inferSelect getter shape by inspecting constructor.
          // We just probe a stable Drizzle internal that every pgTable has.
          Symbol.for("drizzle:IsDrizzleTable") in value
        );
      });
      // Sanity floor — we have ~50 pgTables. Detecting "0 tables" means the
      // barrel regressed back to type-only exports.
      expect(pgTables.length).toBeGreaterThanOrEqual(40);
    });
  });

  describe("fixture hygiene", () => {
    it("inventory JSON is sorted and unique", () => {
      const list: string[] = JSON.parse(
        readFileSync(fixturePath, "utf8"),
      );
      const sorted = [...list].sort();
      expect(list).toEqual(sorted);
      expect(new Set(list).size).toEqual(list.length);
    });

    it("inventory is ≥ the last-known-good size (no silent shrinkage)", () => {
      // At the time of the Phase F-1 commit the monolith exported 88 runtime
      // values. This floor keeps an accidental re-export drop from going
      // unnoticed; increase the floor in the same PR that intentionally adds
      // new tables/schemas.
      const list: string[] = JSON.parse(
        readFileSync(fixturePath, "utf8"),
      );
      expect(list.length).toBeGreaterThanOrEqual(88);
    });
  });

  describe("package.json sanity", () => {
    it("@shared alias still resolves under tsconfig (guards IDE navigation)", () => {
      // A quick sanity check against tsconfig.json paths, since breaking the
      // alias silently would still let the barrel test pass.
      const pkgDir = resolve(__dirname, "..", "..");
      const tsconfig = readFileSync(join(pkgDir, "tsconfig.json"), "utf8");
      expect(tsconfig).toMatch(/"@shared\/\*"\s*:\s*\[\s*"\.\/shared\/\*"\s*\]/);
    });
  });
});
