import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const scriptPath = path.join(repoRoot, "scripts", "db", "export-account-evidence.mjs");
const source = fs.readFileSync(scriptPath, "utf8");

describe("[14-account-evidence] exporter safety contract", () => {
  it("is valid Node syntax and uses one repeatable read-only snapshot", () => {
    const result = spawnSync(process.execPath, ["--check", scriptPath], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(source).toContain("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(source).toContain("FETCH FORWARD ${batchSize}");
    expect(source).toContain("ROLLBACK");
  });

  it("discovers only public base tables and records every non-exported table", () => {
    expect(source).toContain("t.table_type = 'BASE TABLE'");
    expect(source).toContain("c.table_schema = 'public'");
    expect(source).toContain('reason: "no-account-link-resolver"');
    expect(source).toContain('reason: "known-ephemeral-or-secret-bearing-table"');
    expect(source).toContain("excludedTables: skippedTables");
  });

  it("covers user-role, task-role, and known shared descendant relationships", () => {
    expect(source).toContain('column.endsWith("_user_id")');
    expect(source).toContain('column.endsWith("_task_id")');
    expect(source).toContain("sharedListIdsSql");
    expect(source).toContain("conversationIdsSql");
    expect(source).toContain("accountReminderIdsSql");
    expect(source).toContain("accountCommunityPostIdsSql");
    expect(source).toContain("linkingPaths");
    expect(source).toContain("thirdPartyScope");
  });

  it("has no SQL data/schema mutation execution path", () => {
    expect(source).not.toMatch(
      /client\.query\(\s*[`"']\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|VACUUM)\b/i,
    );
    expect(source).not.toMatch(
      /pool\.query\(\s*[`"']\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|VACUUM)\b/i,
    );
  });

  it("requires affirmative production flags and an absolute explicit destination for non-loopback reads", () => {
    expect(source).toContain("function enabledFlag");
    expect(source).toContain('value === true || value === "true" || value === "1"');
    expect(source).toContain('enabledFlag(args, "prod")');
    expect(source).toContain('enabledFlag(args, "force-production")');
    expect(source).toContain("path.isAbsolute(outputDirArg)");
    expect(source).toContain("operator-controlled protected storage");
  });

  it("never logs or serializes DATABASE_URL", () => {
    expect(source).not.toContain("console.log(databaseUrl");
    expect(source).not.toContain("console.error(databaseUrl");
    expect(source).not.toContain("databaseUrl: databaseUrl");
    expect(source).toContain("databaseTargetFingerprint(databaseUrl)");
  });

  it("streams bounded batches and uses stable UTC api_request summary dates", () => {
    expect(source).toContain("DEFAULT_BATCH_SIZE = 1000");
    expect(source).toContain("FETCH FORWARD ${batchSize}");
    expect(source).toContain("writeSync(fd, line");
    expect(source).toContain("set_config('TimeZone', 'UTC', true)");
    expect(source).toContain("created_at AT TIME ZONE 'UTC'");
    expect(source).toContain("'YYYY-MM-DD'");
  });

  it("keeps high-volume api_request row export opt-in", () => {
    expect(source).toContain('DEFAULT_API_REQUEST_MODE = "summary"');
    expect(source).toContain('new Set(["summary", "exclude", "all"])');
    expect(source).toContain("event_type <> 'api_request'");
    expect(source).toContain("firstChainAnchor");
    expect(source).toContain("lastChainAnchor");
    expect(source).toContain("dailyCounts");
    expect(source).toContain("--api-request-mode=all");
  });

  it("records explicit known secret exclusions/redactions", () => {
    for (const table of ["session", "password_reset_tokens", "mfa_challenges", "user_push_subscriptions"]) {
      expect(source).toContain(`"${table}"`);
    }
    for (const column of ["password_hash", "security_answer_hash", "totp_secret_ciphertext", "public_dm_token"]) {
      expect(source).toContain(`"${column}"`);
    }
    expect(source).toContain("redactedColumns");
  });

  it("fsyncs artifacts and directory metadata before clearing the incomplete marker", () => {
    expect(source).toContain("fsyncSync(fd)");
    expect(source).toContain("syncDirectory(exportDir)");
    expect(source).toContain('path.join(exportDir, "EXPORT_INCOMPLETE")');
    const commitIndex = source.indexOf('await client.query("COMMIT")');
    const unlinkIndex = source.indexOf("unlinkSync(incompleteMarker)");
    expect(commitIndex).toBeGreaterThan(-1);
    expect(unlinkIndex).toBeGreaterThan(commitIndex);
    expect(source.slice(commitIndex, unlinkIndex)).toContain("syncDirectory(exportDir)");
    expect(source.slice(unlinkIndex)).toContain("syncDirectory(exportDir)");
  });

  it("hashes all artifacts and explicitly excludes attachment object bytes", () => {
    expect(source).toContain('createHash("sha256")');
    expect(source).toContain("bundleContentSha256");
    expect(source).toContain('path.join(exportDir, "manifest.sha256")');
    expect(source).toContain("attachmentObjectBytesIncluded: false");
  });
});
