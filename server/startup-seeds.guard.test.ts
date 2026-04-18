import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Startup seeds in registerRoutes() must not take down the dev server when Postgres
 * is down. Each await seed*() should sit in a try/catch (see plan: DB-down startup).
 */
describe("startup seeds in routes.ts", () => {
  it("every await seed*() has try { within a short window above (non-fatal seed pattern)", () => {
    const routesPath = join(__dirname, "routes.ts");
    const lines = readFileSync(routesPath, "utf8").split(/\r?\n/);
    const awaitSeed = /\bawait\s+seed[A-Za-z0-9_]*\s*\(/;

    for (let i = 0; i < lines.length; i++) {
      if (!awaitSeed.test(lines[i])) continue;

      let foundTry = false;
      for (let j = i - 1; j >= 0 && i - j <= 20; j--) {
        const t = lines[j].trim();
        if (t === "" || t.startsWith("//")) continue;
        if (/^try\s*\{/.test(t)) {
          foundTry = true;
          break;
        }
        if (/^\}\s*catch\b/.test(t) || /^\}\s*finally\b/.test(t)) break;
      }

      expect(
        foundTry,
        `Line ${i + 1}: await seed...() must follow a try { within 20 lines (wrap seed in try/catch so a down DB does not crash startup):\n  ${lines[i].trim()}`,
      ).toBe(true);
    }
  });
});
