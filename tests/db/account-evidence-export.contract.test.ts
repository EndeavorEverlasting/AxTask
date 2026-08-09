import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const scriptPath = path.join(repoRoot, "scripts", "db", "export-account-evidence.mjs");
const source = fs.readFileSync(scriptPath, "utf8");

describe("account evidence export contract", () => {
  it("is valid Node syntax", () => {
    const result = spawnSync(process.execPath, ["--check", scriptPath], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
  });

  it("uses one repeatable read-only database snapshot", () => {
    expect(source).toContain("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(source).toContain("DECLARE ${quoteIdent(cursorName)} NO SCROLL CURSOR");
    expect(source).toContain("FETCH FORWARD ${batchSize}");
    expect(source).toContain("ROLLBACK");
    expect(source).toContain("COMMIT");
  });

  it("contains no SQL mutation execution path", () => {
    expect(source).not.toMatch(/client\.query\(\s*[`"']\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|VACUUM)\b/i);
    expect(source).not.toMatch(/pool\.query\(\s*[`"']\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|VACUUM)\b/i);
  });

  it("requires explicit intent before reading a non-loopback database", () => {
    expect(source).toContain('!args.has("prod") || !args.has("force-production")');
    expect(source).toContain("non-loopback evidence export requires --prod --force-production");
    expect(source).toContain('"localhost", "127.0.0.1", "::1", "[::1]"');
  });

  it("never prints DATABASE_URL or embeds it in the manifest", () => {
    expect(source).not.toContain("databaseUrl,");
    expect(source).not.toContain("DATABASE_URL:");
    expect(source).toContain("databaseTargetFingerprint(databaseUrl)");
    expect(source).toContain('target: loopback ? "loopback" : "non-loopback"');
  });

  it("streams table rows in bounded cursor batches instead of loading the account into memory", () => {
    expect(source).toContain("DEFAULT_BATCH_SIZE = 1000");
    expect(source).toContain('parseInteger(args.get("batch-size") ?? DEFAULT_BATCH_SIZE, "batch-size", 1, 10000)');
    expect(source).toContain("FETCH FORWARD ${batchSize}");
    expect(source).toContain("writeSync(fd, line");
  });

  it("preserves account-linked records beyond the semantic Backup Center bundle", () => {
    expect(source).toContain('"user_id"');
    expect(source).toContain('"actor_user_id"');
    expect(source).toContain('"target_user_id"');
    expect(source).toContain('columns.has("task_id")');
    expect(source).toContain('columns.has("invoice_id")');
    expect(source).toContain('columns.has("asset_id")');
    expect(source).toContain('tableName === "security_events"');
  });

  it("does not silently turn api_request telemetry into another huge default export", () => {
    expect(source).toContain('DEFAULT_API_REQUEST_MODE = "summary"');
    expect(source).toContain('new Set(["summary", "exclude", "all"])');
    expect(source).toContain("event_type <> 'api_request'");
    expect(source).toContain("buildApiRequestSummary");
    expect(source).toContain("firstChainAnchor");
    expect(source).toContain("lastChainAnchor");
    expect(source).toContain("dailyCounts");
    expect(source).toContain("--api-request-mode=all");
  });

  it("excludes ephemeral credential material and records redactions", () => {
    for (const table of ["session", "password_reset_tokens", "mfa_challenges", "user_push_subscriptions"]) {
      expect(source).toContain(`"${table}"`);
    }
    for (const column of ["password_hash", "security_answer_hash", "totp_secret_ciphertext", "public_dm_token"]) {
      expect(source).toContain(`"${column}"`);
    }
    expect(source).toContain("excludedTables: skippedTables");
    expect(source).toContain("redactedColumns");
  });

  it("hashes every artifact and the manifest", () => {
    expect(source).toContain('createHash("sha256")');
    expect(source).toContain("bundleContentSha256");
    expect(source).toContain('path.join(exportDir, "manifest.sha256")');
    expect(source).toContain("manifestSha256");
  });
});
