#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const startedAt = new Date().toISOString();
const runId = `account-backup-cert-${startedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const runDir = path.join(root, ".ai", "runs", runId);
const resultPath = path.join(runDir, "account-backup-certification.json");
const reportPath = path.join(runDir, "account-backup-certification.md");
const schemaReady = process.argv.includes("--schema-ready");

mkdirSync(runDir, { recursive: true });

const checks = [];
let database = undefined;

function executable(name) {
  if (process.platform !== "win32") return name;
  if (name === "npm") return "npm.cmd";
  if (name === "npx") return "npx.cmd";
  return name;
}

function save(status, proofLevel) {
  const result = {
    schemaVersion: 1,
    runId,
    status,
    proofLevel,
    startedAt,
    finishedAt: new Date().toISOString(),
    ...(database ? { database } : {}),
    checks,
  };
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  writeFileSync(
    reportPath,
    [
      "# Account Backup Round-Trip Certification",
      "",
      `- Run ID: \`${runId}\``,
      `- Status: **${status}**`,
      `- Proof level: \`${proofLevel}\``,
      "",
      "## Checks",
      "",
      ...checks.map((check) => `- ${check.ok ? "PASS" : "FAIL"}: ${check.name}${Number.isInteger(check.exitCode) ? ` (exit ${check.exitCode})` : ""}`),
      "",
      "## Proof boundary",
      "",
      "This certification uses only a loopback PostgreSQL database. It proves the covered account export/import round trip, dry-run non-mutation, source-account non-mutation, task/badge parity, duplicate suppression, and wallet non-restoration warning. It does not prove Neon, Render, production data, disaster-recovery timing, or all future schema versions.",
      "",
    ].join("\n"),
    "utf8",
  );
  console.log(`[account-backup-cert] result: ${resultPath}`);
  console.log(`[account-backup-cert] report: ${reportPath}`);
}

function failBlocked(message) {
  console.error(`[account-backup-cert] BLOCKED: ${message}`);
  checks.push({ name: "disposable-postgres-gate", ok: false });
  save("BLOCKED_NO_DISPOSABLE_POSTGRES", "blocked");
  process.exit(2);
}

function validateDatabase() {
  const raw = process.env.DATABASE_URL || "";
  if (!raw) failBlocked("DATABASE_URL is required.");
  if (process.env.RENDER === "true" || process.env.AXTASK_PRODUCTION === "true") {
    failBlocked("Production host markers are set.");
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    failBlocked("DATABASE_URL is not a valid URL.");
  }

  if (!/^postgres(?:ql)?:$/.test(parsed.protocol)) {
    failBlocked("DATABASE_URL must use PostgreSQL.");
  }

  const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!loopbackHosts.has(parsed.hostname)) {
    failBlocked("Only loopback PostgreSQL hosts are allowed by this certification runner.");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!databaseName || !/(axtask|test|ci|dev)/i.test(databaseName)) {
    failBlocked("Database name must clearly identify an AxTask/test/CI/dev database.");
  }

  database = { hostClass: "loopback", databaseName };
  checks.push({ name: "disposable-postgres-gate", ok: true });
}

function run(name, command, args, env = {}) {
  console.log(`[account-backup-cert] ${name}`);
  const result = spawnSync(executable(command), args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: "inherit",
  });
  const exitCode = result.status ?? 1;
  const ok = exitCode === 0;
  checks.push({ name, ok, exitCode });
  return ok;
}

validateDatabase();

if (!schemaReady) {
  if (!run("drizzle-schema-bootstrap", "npm", ["run", "db:push:ci"])) {
    save("FAIL_SCHEMA_BOOTSTRAP", "disposable-postgres-runtime");
    process.exit(1);
  }
  if (!run("numbered-migrations", process.execPath, ["scripts/apply-migrations.mjs"])) {
    save("FAIL_MIGRATION", "disposable-postgres-runtime");
    process.exit(1);
  }
  if (!run("drizzle-idempotence", "npm", ["run", "db:push:ci"])) {
    save("FAIL_SCHEMA_BOOTSTRAP", "disposable-postgres-runtime");
    process.exit(1);
  }
} else {
  checks.push({ name: "schema-prepared-by-caller", ok: true });
}

const passed = run(
  "account-backup-roundtrip-tests",
  "npx",
  [
    "--no-install",
    "vitest",
    "run",
    "server/routes/account-backup.bundle-kind.test.ts",
    "server/account-backup.integration.test.ts",
  ],
  { RUN_PG_SCHEMA_TESTS: "1" },
);

if (!passed) {
  save("FAIL_DATA_PARITY", "disposable-postgres-runtime");
  process.exit(1);
}

save("PASS_ACCOUNT_ROUNDTRIP", "disposable-postgres-runtime");
