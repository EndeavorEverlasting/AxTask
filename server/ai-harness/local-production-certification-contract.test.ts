// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-ignore Executable repository harness is implemented as ESM .mjs.
import {
  buildLocalCertificationEnv,
  validateLocalDatabaseUrl,
} from "../../scripts/deploy/run-local-cert.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("local production certification safety", () => {
  it("accepts only clearly disposable loopback PostgreSQL targets", () => {
    expect(validateLocalDatabaseUrl("postgresql://user:pass@127.0.0.1:5432/axtask_ci")).toEqual({
      ok: true,
      databaseName: "axtask_ci",
    });
    expect(validateLocalDatabaseUrl("postgres://user:pass@localhost:5432/test_axtask").ok).toBe(true);
  });

  it("rejects Neon and other remote PostgreSQL hosts", () => {
    expect(validateLocalDatabaseUrl("postgresql://user:pass@example.neon.tech/axtask")).toMatchObject({ ok: false });
    expect(validateLocalDatabaseUrl("postgresql://user:pass@db.internal/axtask_test")).toMatchObject({ ok: false });
  });

  it("rejects ambiguous loopback database names", () => {
    expect(validateLocalDatabaseUrl("postgresql://user:pass@127.0.0.1:5432/postgres")).toMatchObject({ ok: false });
  });

  it("forces a quiet local production posture without mutating the caller environment", () => {
    const base = {
      DATABASE_URL: "postgresql://user:pass@127.0.0.1:5432/axtask_ci",
      RENDER: "true",
      BACKUP_SCHEDULER_ENABLED: "true",
    };
    const local = buildLocalCertificationEnv(base, 5055);

    expect(base.RENDER).toBe("true");
    expect(local).toMatchObject({
      NODE_ENV: "production",
      PORT: "5055",
      FORCE_HTTPS: "false",
      AXTASK_SKIP_DB_CAPACITY_CHECK: "true",
      SKIP_DB_PUSH_ON_START: "true",
      DISABLE_REMINDER_DISPATCH: "true",
      DISABLE_ARCHETYPE_ROLLUP: "true",
      DISABLE_RETENTION_PRUNE: "true",
      DISABLE_DB_SIZE_SNAPSHOT: "true",
      DISABLE_OPS_SNAPSHOT: "true",
      AXTASK_ARCHETYPE_POLL_SCHEDULER: "0",
      BACKUP_SCHEDULER_ENABLED: "false",
      BACKUP_QUEUE_WORKER_ENABLED: "false",
      BACKUP_BULLMQ_ENABLED: "false",
      ADHERENCE_INTERVENTIONS_ENABLED: "false",
      SECURITY_API_REQUEST_LOGGING: "false",
      RENDER: "false",
      AXTASK_PRODUCTION: "false",
    });
    expect(local.TOTP_ENCRYPTION_KEY).toMatch(/^[0-9a-f]{64}$/);
  });

  it("provides a session-safe R7 runner that owns disposable PostgreSQL and cleanup", () => {
    const runner = fs.readFileSync(path.join(repoRoot, "scripts/ai-harness/run-r7-local-cert.ps1"), "utf8");
    for (const marker of [
      "postgres:16-alpine",
      "$dockerRunArgs",
      "& docker @dockerRunArgs",
      "POSTGRES_PASSWORD",
      "127.0.0.1::5432",
      "DATABASE_URL",
      "AXTASK_LOCAL_CERT",
      "scripts/deploy/run-local-cert.mjs",
      "scripts/ai-harness/validate-runtime-proof.mjs",
      "test:deploy",
      "run', 'build",
      "docker rm -f",
      "R7_RUNTIME_PROOF",
      "R7_PROOF_CEILING=local-runtime",
    ]) {
      expect(runner).toContain(marker);
    }
    expect(runner).not.toMatch(/Write-(?:Host|Output).*DATABASE_URL/i);
    expect(runner.indexOf("docker rm -f")).toBeLessThan(runner.indexOf("=== R7 PASS ==="));
    expect(runner).toContain("if ($cleanupError)");
    expect(runner).toContain("throw $cleanupError");
    expect(runner).toContain("git status --porcelain");
    expect(runner).not.toMatch(/rev-parse[^\n]+\)\.Trim\(\)/);
  });
});
