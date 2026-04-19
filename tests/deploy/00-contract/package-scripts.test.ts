/**
 * Contract: package.json must expose the scripts the deploy pipeline depends on.
 * If any of these go missing a deploy step silently breaks.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");

const pkg = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
);

const REQUIRED_SCRIPTS = [
  "build",
  "start",
  "start:app",
  "check",
  "test",
  "db:push",
  "perf:bundle",
  "perf:ci",
];

const REQUIRED_DEPLOY_SCRIPTS = [
  "test:deploy",
  "test:deploy:contract",
  "test:deploy:env",
  "test:deploy:artifacts",
  "test:deploy:capacity",
  "test:deploy:classify",
];

describe("[00-contract] package.json scripts", () => {
  it.each(REQUIRED_SCRIPTS)("has script %s", (script) => {
    expect(pkg.scripts).toHaveProperty(script);
    expect(typeof pkg.scripts[script]).toBe("string");
  });

  it.each(REQUIRED_DEPLOY_SCRIPTS)("has deploy script %s", (script) => {
    expect(pkg.scripts).toHaveProperty(script);
  });

  it("production-start chains migrations before server boot", () => {
    const startScript = pkg.scripts.start;
    expect(startScript).toMatch(/production-start\.mjs/);
  });
});

describe("[00-contract] runtime files Render and Docker depend on", () => {
  const runtimeFiles = [
    "scripts/production-start.mjs",
    "scripts/apply-migrations.mjs",
    "drizzle.config.ts",
    "migrations",
    "render.yaml",
    "Dockerfile",
  ];

  it.each(runtimeFiles)("%s exists", (rel) => {
    expect(fs.existsSync(path.join(repoRoot, rel))).toBe(true);
  });
});
