// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-ignore executable ESM helper intentionally has no .d.ts surface.
import {
  assertNoDatabaseTargetOverrides,
  isDisposableLocalDatabaseUrl,
  isLoopbackDatabaseUrl,
} from "../../../scripts/db/pg-tools.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const migrationRunner = fs.readFileSync(
  path.join(repoRoot, "scripts", "apply-migrations.mjs"),
  "utf8",
);

describe("[04-migrations] recovery-only production startup target identity", () => {
  it("recognizes canonical disposable loopback PostgreSQL URLs", () => {
    expect(isLoopbackDatabaseUrl("postgresql://u:p@localhost:5432/axtask")).toBe(true);
    expect(isLoopbackDatabaseUrl("postgresql://u:p@127.0.0.1:5432/axtask")).toBe(true);
    expect(isLoopbackDatabaseUrl("postgresql://u:p@[::1]:5432/axtask")).toBe(true);
  });

  it("treats the Compose service hostname database as disposable for recovery replay", () => {
    expect(isDisposableLocalDatabaseUrl("postgresql://axtask:replace-me@database:5432/axtask")).toBe(
      true,
    );
    expect(isDisposableLocalDatabaseUrl("postgresql://u:p@localhost:5432/axtask")).toBe(true);
    expect(
      isDisposableLocalDatabaseUrl(
        "postgresql://u:p@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=require",
      ),
    ).toBe(false);
  });

  it("does not recognize a Neon-style remote target as loopback", () => {
    expect(
      isLoopbackDatabaseUrl(
        "postgresql://u:p@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=require",
      ),
    ).toBe(false);
  });

  it.each([
    "postgresql://u:p@localhost:5432/axtask?host=remote.example",
    "postgresql://u:p@localhost:5432/axtask?hostaddr=203.0.113.7",
    "postgresql://u:p@localhost:5432/axtask?port=6543",
    "postgresql://u:p@localhost:5432/axtask?dbname=other",
    "postgresql://u:p@localhost:5432/axtask?service=prod",
  ])("rejects routing override %s before loopback trust", (url) => {
    expect(() => assertNoDatabaseTargetOverrides(url)).toThrow(
      /forbidden connection-target override/i,
    );
  });

  it("calls target-override rejection before trusting the disposable-local classifier", () => {
    const assertIdx = migrationRunner.indexOf("assertNoDatabaseTargetOverrides(url)");
    const disposableIdx = migrationRunner.indexOf("isDisposableLocalDatabaseUrl(url)");
    expect(assertIdx).toBeGreaterThan(-1);
    expect(disposableIdx).toBeGreaterThan(assertIdx);
  });

  it("does not offer a production-startup override for recovery-only SQL", () => {
    expect(migrationRunner).not.toContain("ALLOW_RECOVERY_MIGRATION_ON_START");
    expect(migrationRunner).not.toContain("SKIP_RECOVERY_MIGRATION_GUARD");
    expect(migrationRunner).toContain("RECOVERY_ONLY_MIGRATION_PENDING");
  });
});
