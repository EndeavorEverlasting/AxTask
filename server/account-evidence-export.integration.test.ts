import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pgModule from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pg = pgModule.default || pgModule;
const databaseUrl = process.env.DATABASE_URL || "";
const runPg = process.env.RUN_PG_SCHEMA_TESTS === "1";

function isLoopbackPostgres(raw: string): boolean {
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return (
      /^postgres(?:ql)?:$/.test(parsed.protocol) &&
      new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(parsed.hostname)
    );
  } catch {
    return false;
  }
}

const describePg = runPg && isLoopbackPostgres(databaseUrl) ? describe : describe.skip;

describePg("account evidence export disposable-postgres certification", () => {
  const userId = randomUUID();
  const taskId = randomUUID();
  const communityPostId = randomUUID();
  const email = `evidence-${userId}@example.test`;
  const outputRoot = mkdtempSync(path.join(os.tmpdir(), "axtask-evidence-cert-"));
  const passwordSecret = `password-hash-${randomUUID()}`;
  const totpSecret = `totp-ciphertext-${randomUUID()}`;
  const meaningfulHash = createHash("sha256").update(`meaningful:${userId}`).digest("hex");
  const apiHash1 = createHash("sha256").update(`api1:${userId}`).digest("hex");
  const apiHash2 = createHash("sha256").update(`api2:${userId}`).digest("hex");
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO users (id, email, password_hash, totp_secret_ciphertext, created_at)
       VALUES ($1, $2, $3, $4, now())`,
      [userId, email, passwordSecret, totpSecret],
    );
    await pool.query(
      `INSERT INTO tasks
        (id, user_id, date, activity, notes, priority, priority_score, classification, status, created_at, updated_at)
       VALUES ($1, $2, '2026-08-09', 'Evidence export certification task', 'preserve me',
               'medium', 10, 'work', 'completed', now(), now())`,
      [taskId, userId],
    );
    await pool.query(
      `INSERT INTO community_posts
        (id, avatar_key, avatar_name, title, body, category, related_task_id, created_at)
       VALUES ($1, 'productivity', 'Certification Avatar', 'Task-linked evidence',
               'Indirect account-linked row', 'general', $2, now())`,
      [communityPostId, taskId],
    );
    await pool.query(
      `INSERT INTO security_events
        (event_type, actor_user_id, route, method, status_code, payload_json, prev_hash, event_hash, created_at)
       VALUES
        ('account_json_export', $1, '/api/account/export', 'GET', 200, '{"kind":"meaningful"}', NULL, $2, now() - interval '3 minutes')`,
      [userId, meaningfulHash],
    );

    // Migration 9999 correctly suppresses new api_request rows. This disposable-only
    // fixture temporarily disables that trigger so the test can model historical rows
    // that existed before containment. It is restored before the exporter runs.
    await pool.query(
      `ALTER TABLE security_events DISABLE TRIGGER trg_suppress_api_request_security_events`,
    );
    try {
      await pool.query(
        `INSERT INTO security_events
          (event_type, actor_user_id, route, method, status_code, payload_json, prev_hash, event_hash, created_at)
         VALUES
          ('api_request', $1, '/api/tasks', 'GET', 200, NULL, $2, $3, now() - interval '2 minutes'),
          ('api_request', $1, '/api/tasks', 'GET', 200, NULL, $3, $4, now() - interval '1 minute')`,
        [userId, meaningfulHash, apiHash1, apiHash2],
      );
    } finally {
      await pool.query(
        `ALTER TABLE security_events ENABLE TRIGGER trg_suppress_api_request_security_events`,
      );
    }

    await pool.query(
      `INSERT INTO mfa_challenges
        (user_id, purpose, code_hash, expires_at, created_at)
       VALUES ($1, 'account_data_export', $2, now() + interval '10 minutes', now())`,
      [userId, `mfa-code-hash-${randomUUID()}`],
    );
  });

  afterAll(async () => {
    try {
      await pool.query(`DELETE FROM community_posts WHERE id = $1`, [communityPostId]);
      await pool.query(
        `DELETE FROM security_events WHERE actor_user_id = $1 OR target_user_id = $1`,
        [userId],
      );
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    } finally {
      await pool.end();
      rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  it("exports a complete hashed read-only bundle without mutating source rows", async () => {
    const before = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM tasks WHERE user_id = $1) AS tasks,
         (SELECT count(*)::int FROM community_posts WHERE related_task_id = $2) AS community_posts,
         (SELECT count(*)::int FROM security_events WHERE actor_user_id = $1 OR target_user_id = $1) AS events,
         (SELECT count(*)::int FROM security_events WHERE actor_user_id = $1 AND event_type = 'api_request') AS api_requests`,
      [userId, taskId],
    );

    const result = spawnSync(
      process.execPath,
      [
        "scripts/db/export-account-evidence.mjs",
        `--user-id=${userId}`,
        `--output-dir=${outputRoot}`,
        "--api-request-mode=summary",
        "--batch-size=2",
        "--json",
      ],
      {
        cwd: path.resolve(process.cwd()),
        env: { ...process.env, DATABASE_URL: databaseUrl },
        encoding: "utf8",
      },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain(passwordSecret);
    expect(result.stdout).not.toContain(totpSecret);

    const cliResult = JSON.parse(result.stdout.trim()) as {
      ok: boolean;
      outputDirectory: string;
      manifestFile: string;
      manifestSha256: string;
      apiRequestMode: string;
      target: string;
      skippedTableCount: number;
    };
    expect(cliResult).toMatchObject({
      ok: true,
      apiRequestMode: "summary",
      target: "loopback",
    });
    expect(cliResult.skippedTableCount).toBeGreaterThan(0);

    const exportDir = cliResult.outputDirectory;
    expect(existsSync(exportDir)).toBe(true);
    expect(existsSync(path.join(exportDir, "EXPORT_INCOMPLETE"))).toBe(false);
    expect(existsSync(path.join(exportDir, "manifest.json"))).toBe(true);
    expect(existsSync(path.join(exportDir, "manifest.sha256"))).toBe(true);

    const manifestText = readFileSync(path.join(exportDir, "manifest.json"), "utf8");
    expect(manifestText).not.toContain(passwordSecret);
    expect(manifestText).not.toContain(totpSecret);

    const manifest = JSON.parse(manifestText) as {
      account: { id: string; email: string };
      apiRequestMode: string;
      attachmentObjectBytesIncluded: boolean;
      accountLinkPolicy: { thirdPartyScope: string };
      files: Array<{
        table: string;
        file: string;
        rowCount: number;
        sha256: string;
        redactedColumns: string[];
        linkingPaths: string[];
      }>;
      excludedTables: Array<{ table: string; reason: string }>;
      completenessMarkerPolicy: string;
    };
    expect(manifest.account).toMatchObject({ id: userId, email });
    expect(manifest.apiRequestMode).toBe("summary");
    expect(manifest.attachmentObjectBytesIncluded).toBe(false);
    expect(manifest.accountLinkPolicy.thirdPartyScope).toContain("other users");
    expect(manifest.completenessMarkerPolicy).toContain("excludedTables is reviewed");
    expect(manifest.excludedTables).toContainEqual({
      table: "mfa_challenges",
      reason: "known-ephemeral-or-secret-bearing-table",
    });
    expect(manifest.excludedTables.some((entry) => entry.reason === "no-account-link-resolver")).toBe(true);

    const manifestDigest = createHash("sha256").update(manifestText, "utf8").digest("hex");
    expect(manifestDigest).toBe(cliResult.manifestSha256);
    expect(readFileSync(path.join(exportDir, "manifest.sha256"), "utf8")).toBe(
      `${manifestDigest}  manifest.json\n`,
    );

    for (const entry of manifest.files) {
      const filePath = path.join(exportDir, entry.file);
      expect(existsSync(filePath)).toBe(true);
      const digest = createHash("sha256").update(readFileSync(filePath)).digest("hex");
      expect(digest, entry.file).toBe(entry.sha256);
    }

    const usersEntry = manifest.files.find((entry) => entry.table === "users");
    expect(usersEntry).toBeTruthy();
    expect(usersEntry?.redactedColumns).toContain("password_hash");
    expect(usersEntry?.redactedColumns).toContain("totp_secret_ciphertext");
    const usersText = readFileSync(path.join(exportDir, usersEntry!.file), "utf8");
    expect(usersText).toContain(email);
    expect(usersText).not.toContain(passwordSecret);
    expect(usersText).not.toContain(totpSecret);

    const communityEntry = manifest.files.find((entry) => entry.table === "community_posts");
    expect(communityEntry?.rowCount).toBe(1);
    expect(communityEntry?.linkingPaths).toContain("related_task_id->tasks.user_id");
    expect(readFileSync(path.join(exportDir, communityEntry!.file), "utf8")).toContain(
      "Task-linked evidence",
    );

    const securityEntry = manifest.files.find((entry) => entry.table === "security_events");
    expect(securityEntry?.rowCount).toBe(1);
    const securityText = readFileSync(path.join(exportDir, securityEntry!.file), "utf8");
    expect(securityText).toContain("account_json_export");
    expect(securityText).not.toContain('"event_type":"api_request"');

    const summaryName = "security_events.api_request.summary.json";
    expect(readdirSync(exportDir)).toContain(summaryName);
    const summary = JSON.parse(readFileSync(path.join(exportDir, summaryName), "utf8")) as {
      rowCount: string;
      firstChainAnchor: { event_hash: string };
      lastChainAnchor: { event_hash: string };
      dailyCounts: Array<{ day: string; row_count: string }>;
    };
    expect(summary.rowCount).toBe("2");
    expect(summary.firstChainAnchor.event_hash).toBe(apiHash1);
    expect(summary.lastChainAnchor.event_hash).toBe(apiHash2);
    expect(summary.dailyCounts.reduce((sum, row) => sum + Number(row.row_count), 0)).toBe(2);
    for (const row of summary.dailyCounts) {
      expect(row.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }

    expect(readdirSync(exportDir)).not.toContain("mfa_challenges.jsonl");

    const after = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM tasks WHERE user_id = $1) AS tasks,
         (SELECT count(*)::int FROM community_posts WHERE related_task_id = $2) AS community_posts,
         (SELECT count(*)::int FROM security_events WHERE actor_user_id = $1 OR target_user_id = $1) AS events,
         (SELECT count(*)::int FROM security_events WHERE actor_user_id = $1 AND event_type = 'api_request') AS api_requests`,
      [userId, taskId],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  }, 30_000);
});
