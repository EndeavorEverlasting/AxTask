#!/usr/bin/env node
import "dotenv/config";
import { createHash } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pgModule from "pg";
import { databaseTargetFingerprint } from "./pg-tools.mjs";

const pg = pgModule.default || pgModule;

const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_API_REQUEST_MODE = "summary";
const API_REQUEST_MODES = new Set(["summary", "exclude", "all"]);
const SENSITIVE_TABLES_EXCLUDED = new Set([
  "session",
  "password_reset_tokens",
  "mfa_challenges",
  "user_push_subscriptions",
]);
const REDACTED_COLUMNS = new Map([
  [
    "users",
    new Set([
      "password_hash",
      "security_answer_hash",
      "workos_id",
      "google_id",
      "replit_id",
      "public_dm_token",
      "phone_e164",
      "totp_secret_ciphertext",
    ]),
  ],
  ["idempotency_keys", new Set(["key"])],
]);
const DIRECT_ACCOUNT_COLUMNS = [
  "user_id",
  "actor_user_id",
  "target_user_id",
  "deleted_by",
];

function parseArgs(argv) {
  const values = new Map();
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const eq = raw.indexOf("=");
    if (eq === -1) values.set(raw.slice(2), true);
    else values.set(raw.slice(2, eq), raw.slice(eq + 1));
  }
  return values;
}

function parseInteger(raw, name, min, max) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`--${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL || "";
  if (!url) throw new Error("DATABASE_URL is required");
  return url;
}

function isLoopbackDatabase(databaseUrl) {
  const parsed = new URL(databaseUrl);
  return new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(parsed.hostname);
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function safeFilePart(value) {
  return (
    String(value)
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  );
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function gitCommit() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function rowCreatedAt(row) {
  const value = row.created_at ?? row.createdAt ?? null;
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function serializableRow(tableName, row) {
  const redacted = REDACTED_COLUMNS.get(tableName) || new Set();
  const output = {};
  for (const [key, value] of Object.entries(row)) {
    if (redacted.has(key)) continue;
    output[key] = value;
  }
  return output;
}

function buildPredicate(tableName, columns) {
  if (tableName === "users" && columns.has("id")) {
    return `id = current_setting('axtask.evidence_user_id')`;
  }

  const clauses = [];
  for (const column of DIRECT_ACCOUNT_COLUMNS) {
    if (columns.has(column)) {
      clauses.push(
        `${quoteIdent(column)} = current_setting('axtask.evidence_user_id')`,
      );
    }
  }
  if (columns.has("task_id")) {
    clauses.push(
      `${quoteIdent("task_id")} IN (SELECT id FROM public.tasks WHERE user_id = current_setting('axtask.evidence_user_id'))`,
    );
  }
  if (columns.has("invoice_id")) {
    clauses.push(
      `${quoteIdent("invoice_id")} IN (SELECT id FROM public.invoices WHERE user_id = current_setting('axtask.evidence_user_id'))`,
    );
  }
  if (columns.has("asset_id")) {
    clauses.push(
      `${quoteIdent("asset_id")} IN (SELECT id FROM public.attachment_assets WHERE user_id = current_setting('axtask.evidence_user_id'))`,
    );
  }
  return clauses.length > 0 ? `(${clauses.join(" OR ")})` : null;
}

function orderByFor(columns) {
  if (columns.has("created_at") && columns.has("id")) {
    return " ORDER BY created_at, id";
  }
  if (columns.has("created_at")) return " ORDER BY created_at";
  if (columns.has("id")) return " ORDER BY id";
  return "";
}

async function discoverTables(client) {
  const result = await client.query(`
    SELECT c.table_name,
           array_agg(c.column_name ORDER BY c.ordinal_position) AS columns
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
    GROUP BY c.table_name
    ORDER BY c.table_name
  `);
  return result.rows.map((row) => ({
    tableName: row.table_name,
    columns: new Set(row.columns || []),
  }));
}

async function resolveAccount(client, args) {
  const userId = args.get("user-id");
  const email = args.get("email");
  if (Boolean(userId) === Boolean(email)) {
    throw new Error(
      "provide exactly one selector: --user-id=<uuid> or --email=<address>",
    );
  }
  const result = userId
    ? await client.query(
        `SELECT id, email, display_name, created_at FROM public.users WHERE id = $1 LIMIT 1`,
        [userId],
      )
    : await client.query(
        `SELECT id, email, display_name, created_at FROM public.users WHERE lower(email) = lower($1) LIMIT 1`,
        [email],
      );
  if (result.rowCount !== 1) {
    throw new Error("account selector did not resolve exactly one user");
  }
  return result.rows[0];
}

async function exportQueryToJsonl(client, options) {
  const { tableName, querySql, outputFile, batchSize } = options;
  const cursorName = `evidence_cursor_${safeFilePart(tableName).replaceAll("-", "_")}`;
  const fd = openSync(outputFile, "w", 0o600);
  const hash = createHash("sha256");
  let rowCount = 0;
  let firstCreatedAt = null;
  let lastCreatedAt = null;
  let byteSize = 0;

  try {
    await client.query(
      `DECLARE ${quoteIdent(cursorName)} NO SCROLL CURSOR FOR ${querySql}`,
    );
    while (true) {
      const batch = await client.query(
        `FETCH FORWARD ${batchSize} FROM ${quoteIdent(cursorName)}`,
      );
      if (batch.rows.length === 0) break;
      for (const rawRow of batch.rows) {
        const row = serializableRow(tableName, rawRow);
        const line = `${JSON.stringify(row)}\n`;
        writeSync(fd, line, null, "utf8");
        hash.update(line, "utf8");
        byteSize += Buffer.byteLength(line);
        rowCount += 1;
        const createdAt = rowCreatedAt(row);
        if (createdAt && !firstCreatedAt) firstCreatedAt = createdAt;
        if (createdAt) lastCreatedAt = createdAt;
      }
    }
    await client.query(`CLOSE ${quoteIdent(cursorName)}`);
  } finally {
    closeSync(fd);
  }

  return {
    table: tableName,
    file: path.basename(outputFile),
    rowCount,
    byteSize,
    sha256: hash.digest("hex"),
    firstCreatedAt,
    lastCreatedAt,
    redactedColumns: [...(REDACTED_COLUMNS.get(tableName) || [])],
  };
}

async function buildApiRequestSummary(client, predicate) {
  const scoped = `${predicate} AND event_type = 'api_request'`;
  const totals = await client.query(`
    SELECT count(*)::bigint AS row_count,
           min(created_at) AS first_created_at,
           max(created_at) AS last_created_at
    FROM public.security_events
    WHERE ${scoped}
  `);
  const first = await client.query(`
    SELECT id, created_at, prev_hash, event_hash
    FROM public.security_events
    WHERE ${scoped}
    ORDER BY created_at ASC NULLS LAST, id ASC
    LIMIT 1
  `);
  const last = await client.query(`
    SELECT id, created_at, prev_hash, event_hash
    FROM public.security_events
    WHERE ${scoped}
    ORDER BY created_at DESC NULLS LAST, id DESC
    LIMIT 1
  `);
  const daily = await client.query(`
    SELECT date_trunc('day', created_at)::date AS day,
           count(*)::bigint AS row_count
    FROM public.security_events
    WHERE ${scoped}
    GROUP BY 1
    ORDER BY 1
  `);
  return {
    policy: "summary",
    rowCount: totals.rows[0]?.row_count ?? "0",
    firstCreatedAt: totals.rows[0]?.first_created_at ?? null,
    lastCreatedAt: totals.rows[0]?.last_created_at ?? null,
    firstChainAnchor: first.rows[0] || null,
    lastChainAnchor: last.rows[0] || null,
    dailyCounts: daily.rows,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = requireDatabaseUrl();
  const apiRequestMode = String(
    args.get("api-request-mode") || DEFAULT_API_REQUEST_MODE,
  );
  if (!API_REQUEST_MODES.has(apiRequestMode)) {
    throw new Error("--api-request-mode must be one of summary, exclude, all");
  }
  const batchSize = parseInteger(
    args.get("batch-size") ?? DEFAULT_BATCH_SIZE,
    "batch-size",
    1,
    10000,
  );
  const loopback = isLoopbackDatabase(databaseUrl);
  if (!loopback && (!args.has("prod") || !args.has("force-production"))) {
    throw new Error(
      "non-loopback evidence export requires --prod --force-production",
    );
  }

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    const account = await resolveAccount(client, args);
    await client.query(
      `SELECT set_config('axtask.evidence_user_id', $1, true)`,
      [account.id],
    );

    const root = path.resolve(
      String(args.get("output-dir") || path.join(".backups", "evidence")),
    );
    const exportDir = path.join(
      root,
      `account-evidence-${nowStamp()}-${safeFilePart(String(account.id).slice(0, 12))}`,
    );
    mkdirSync(exportDir, { recursive: true, mode: 0o700 });
    const incompleteMarker = path.join(exportDir, "EXPORT_INCOMPLETE");
    writeFileSync(
      incompleteMarker,
      "This account evidence export did not complete. Do not treat this directory as verified preservation evidence.\n",
      { encoding: "utf8", mode: 0o600 },
    );

    const discovered = await discoverTables(client);
    const files = [];
    const skippedTables = [];
    let apiRequestSummary = null;

    for (const table of discovered) {
      const { tableName, columns } = table;
      const predicate = buildPredicate(tableName, columns);
      if (!predicate) continue;
      if (SENSITIVE_TABLES_EXCLUDED.has(tableName)) {
        skippedTables.push({
          table: tableName,
          reason: "ephemeral-or-secret-bearing",
        });
        continue;
      }

      let where = predicate;
      if (tableName === "security_events" && apiRequestMode !== "all") {
        where = `${predicate} AND event_type <> 'api_request'`;
        if (apiRequestMode === "summary") {
          apiRequestSummary = await buildApiRequestSummary(client, predicate);
        }
      }

      const outputFile = path.join(
        exportDir,
        `${safeFilePart(tableName)}.jsonl`,
      );
      const querySql = `SELECT * FROM public.${quoteIdent(tableName)} WHERE ${where}${orderByFor(columns)}`;
      files.push(
        await exportQueryToJsonl(client, {
          tableName,
          querySql,
          outputFile,
          batchSize,
        }),
      );
    }

    if (apiRequestSummary) {
      const summaryFile = path.join(
        exportDir,
        "security_events.api_request.summary.json",
      );
      const summaryText = `${JSON.stringify(apiRequestSummary, null, 2)}\n`;
      writeFileSync(summaryFile, summaryText, {
        encoding: "utf8",
        mode: 0o600,
      });
      files.push({
        table: "security_events:api_request-summary",
        file: path.basename(summaryFile),
        rowCount: Number(apiRequestSummary.rowCount || 0),
        byteSize: statSync(summaryFile).size,
        sha256: createHash("sha256").update(summaryText, "utf8").digest("hex"),
        firstCreatedAt: apiRequestSummary.firstCreatedAt,
        lastCreatedAt: apiRequestSummary.lastCreatedAt,
        redactedColumns: [],
      });
    }

    const fileDigestInput = files
      .map((entry) => `${entry.file}\t${entry.sha256}\t${entry.rowCount}`)
      .sort()
      .join("\n");
    const manifest = {
      schemaVersion: 1,
      exportKind: "axtask-account-evidence",
      createdAt: new Date().toISOString(),
      proofBoundary:
        "read-only database snapshot artifact; not a legal admissibility determination",
      databaseFingerprint: databaseTargetFingerprint(databaseUrl),
      sourceGitCommit: gitCommit(),
      transactionIsolation: "REPEATABLE READ READ ONLY",
      completenessMarkerPolicy:
        "valid only when EXPORT_INCOMPLETE is absent and manifest.sha256 verifies",
      account: {
        id: account.id,
        email: account.email,
        displayName: account.display_name ?? null,
        createdAt: account.created_at ?? null,
      },
      apiRequestMode,
      apiRequestPolicy:
        apiRequestMode === "summary"
          ? "meaningful security events exported row-for-row; api_request telemetry preserved as count/time/hash-chain summary unless --api-request-mode=all is explicitly selected"
          : apiRequestMode === "exclude"
            ? "api_request telemetry intentionally excluded; manifest records the exclusion"
            : "all account-linked api_request rows exported row-for-row",
      batchSize,
      files,
      excludedTables: skippedTables,
      bundleContentSha256: createHash("sha256")
        .update(fileDigestInput, "utf8")
        .digest("hex"),
    };

    const manifestFile = path.join(exportDir, "manifest.json");
    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    writeFileSync(manifestFile, manifestText, {
      encoding: "utf8",
      mode: 0o600,
    });
    const manifestSha = createHash("sha256")
      .update(manifestText, "utf8")
      .digest("hex");
    writeFileSync(
      path.join(exportDir, "manifest.sha256"),
      `${manifestSha}  manifest.json\n`,
      { encoding: "utf8", mode: 0o600 },
    );

    await client.query("COMMIT");
    committed = true;
    unlinkSync(incompleteMarker);

    const result = {
      ok: true,
      outputDirectory: exportDir,
      manifestFile,
      manifestSha256: manifestSha,
      fileCount: files.length,
      apiRequestMode,
      target: loopback ? "loopback" : "non-loopback",
    };
    if (args.has("json")) {
      console.log(JSON.stringify(result));
    } else {
      console.log(`[account-evidence] wrote ${files.length} evidence artifacts`);
      console.log(`[account-evidence] manifest ${manifestFile}`);
      console.log(`[account-evidence] manifest sha256 ${manifestSha}`);
    }
  } finally {
    if (!committed) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    `[account-evidence] FAILED: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
