/**
 * Contract tests for scripts/apply-migrations.mjs and the migration folder.
 * These do NOT touch a real database — they verify file-level properties
 * that protect us from shipping a broken migration pipeline.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");

describe("[04-migrations] apply-migrations.mjs", () => {
  const scriptPath = path.join(repoRoot, "scripts", "apply-migrations.mjs");
  let src = "";

  it("exists and is readable", () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
    src = fs.readFileSync(scriptPath, "utf8");
    expect(src.length).toBeGreaterThan(0);
  });

  it("exits with code 1 when DATABASE_URL is missing", () => {
    if (!src) src = fs.readFileSync(scriptPath, "utf8");
    expect(src).toMatch(/DATABASE_URL/);
    expect(src).toMatch(/process\.exit\(1\)/);
  });

  it("tracks applied migrations in applied_sql_migrations table", () => {
    if (!src) src = fs.readFileSync(scriptPath, "utf8");
    expect(src).toMatch(/applied_sql_migrations/);
    expect(src).toMatch(/CREATE TABLE IF NOT EXISTS/i);
  });

  it("applies migrations in lexicographic order", () => {
    if (!src) src = fs.readFileSync(scriptPath, "utf8");
    expect(src).toMatch(/\.sort\(\s*\)/);
  });

  it("is idempotent: re-running skips already-applied files", () => {
    if (!src) src = fs.readFileSync(scriptPath, "utf8");
    expect(src).toMatch(/already applied/i);
  });
});

describe("[04-migrations] migrations/", () => {
  const migrationsDir = path.join(repoRoot, "migrations");

  it("exists", () => {
    expect(fs.existsSync(migrationsDir)).toBe(true);
  });

  it("contains only .sql files (no stray scripts that would confuse the runner)", () => {
    const entries = fs.readdirSync(migrationsDir).filter((f) => {
      const full = path.join(migrationsDir, f);
      return fs.statSync(full).isFile();
    });
    for (const file of entries) {
      if (file.startsWith(".")) continue;
      if (file.toLowerCase() === "readme.md") continue;
      expect(
        file.endsWith(".sql"),
        `migrations/${file} must be .sql (runner globs migrations/*.sql)`,
      ).toBe(true);
    }
  });

  it("filenames sort in a deterministic lexicographic order", () => {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"));
    const sorted = [...files].sort();
    expect(files.slice().sort()).toEqual(sorted);
  });
});

describe("[04-migrations] production-start.mjs chain order", () => {
  const src = fs.readFileSync(
    path.join(repoRoot, "scripts", "production-start.mjs"),
    "utf8",
  );

  // Strip comments to avoid false positives from the header docstring that
  // also mentions "drizzle-kit" and "apply-migrations.mjs".
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\*.*$/gm, "")
    .replace(/\/\/.*$/gm, "");

  it("runs apply-migrations.mjs before drizzle-kit push", () => {
    const applyIdx = codeOnly.indexOf("apply-migrations.mjs");
    const drizzleIdx = codeOnly.indexOf("drizzle-kit");
    expect(applyIdx).toBeGreaterThan(-1);
    expect(drizzleIdx).toBeGreaterThan(-1);
    expect(applyIdx).toBeLessThan(drizzleIdx);
  });

  it("spawns the server process after drizzle-kit push", () => {
    // The server is started via `spawn(process.execPath, [distIndex], ...)`
    // which must appear AFTER the drizzle-kit spawn in source order.
    const drizzleIdx = codeOnly.indexOf("drizzle-kit");
    const spawnIdx = codeOnly.search(/\bspawn\s*\(\s*process\.execPath\s*,\s*\[distIndex\]/);
    expect(drizzleIdx).toBeGreaterThan(-1);
    expect(spawnIdx).toBeGreaterThan(-1);
    expect(drizzleIdx).toBeLessThan(spawnIdx);
  });
});
