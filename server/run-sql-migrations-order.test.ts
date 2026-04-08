import { readdirSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/** Lexical order matches `scripts/run-sql-migrations.mjs` (production / Docker start). */
describe("migrations/*.sql ordering", () => {
  it("lists only .sql files in lexical order for the runner", () => {
    const dir = path.join(process.cwd(), "migrations");
    const names = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    expect(names.length).toBeGreaterThan(0);
    expect(names[0]).toMatch(/^0000/);
    const last = names[names.length - 1]!;
    expect(last).toMatch(/\.sql$/);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });
});
