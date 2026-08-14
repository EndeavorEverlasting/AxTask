#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SCHEMA = 'axtask_dr_drill';
const TABLE = `${SCHEMA}.probe`;

function fail(message) {
  throw new Error(message);
}

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) fail(`${name} is required`);
  return value;
}

function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: process.env,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error || result.status !== 0) {
    const detail = capture ? String(result.stderr || '').trim().split('\n').slice(-1)[0] : '';
    fail(`${command} failed${detail ? `: ${detail}` : ''}`);
  }
  return capture ? String(result.stdout || '').trim() : '';
}

function toolExists(tool) {
  const result = spawnSync(tool, ['--version'], { encoding: 'utf8', stdio: 'ignore' });
  if (result.error || result.status !== 0) fail(`${tool} is required`);
}

function isLoopbackDatabaseUrl(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

function targetIdentity(value) {
  const url = new URL(value);
  return `${url.hostname.toLowerCase()}:${url.port || '5432'}/${url.pathname.replace(/^\//, '') || 'postgres'}`;
}

function psql(url, sql) {
  return run('psql', [url, '-X', '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-q', '-c', sql], { capture: true });
}

function countRows(url) {
  const value = Number(psql(url, `SELECT count(*)::bigint FROM ${TABLE};`).split(/\s+/).filter(Boolean).at(-1));
  if (!Number.isFinite(value) || value < 0) fail('could not read drill row count');
  return value;
}

function parseReplicaUrls() {
  const raw = String(process.env.DRILL_REPLICA_URLS_JSON || '[]').trim();
  let values;
  try {
    values = JSON.parse(raw);
  } catch {
    fail('DRILL_REPLICA_URLS_JSON must be a JSON array');
  }
  if (!Array.isArray(values)) fail('DRILL_REPLICA_URLS_JSON must be a JSON array');
  return values.map(String).filter(Boolean);
}

function waitForReplicaDelete(url, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() <= deadline) {
    try {
      if (countRows(url) === 0) return true;
    } catch {
      // Retry until the bounded deadline; replicas can briefly reconnect during a drill.
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  return false;
}

async function main() {
  if (!process.argv.includes('--confirm=ROGUE_DELETE_DRILL')) {
    fail('explicit --confirm=ROGUE_DELETE_DRILL is required');
  }

  const sourceUrl = requireEnv('DRILL_DATABASE_URL');
  const restoreUrl = requireEnv('DRILL_RESTORE_DATABASE_URL');
  const replicaUrls = parseReplicaUrls();
  const targets = [sourceUrl, restoreUrl, ...replicaUrls];
  if (targets.some((url) => !isLoopbackDatabaseUrl(url))) {
    fail('rogue-delete drill is restricted to loopback/disposable PostgreSQL targets');
  }
  if (new Set(targets.map(targetIdentity)).size !== targets.length) {
    fail('source, restore, and replica drill databases must all be distinct targets');
  }

  toolExists('psql');
  toolExists('pg_dump');
  toolExists('pg_restore');

  const workDir = path.join(os.tmpdir(), `axtask-rogue-delete-${process.pid}-${randomUUID()}`);
  mkdirSync(workDir, { mode: 0o700 });
  const dumpFile = path.join(workDir, 'drill.dump');
  const rowCount = Number(process.env.DRILL_ROW_COUNT || 10000);
  if (!Number.isInteger(rowCount) || rowCount < 10 || rowCount > 100000) fail('DRILL_ROW_COUNT must be an integer from 10 to 100000');

  try {
    psql(sourceUrl, `DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA}; CREATE TABLE ${TABLE} (id bigint PRIMARY KEY, payload text NOT NULL); INSERT INTO ${TABLE}(id, payload) SELECT g, 'drill-' || g::text FROM generate_series(1, ${rowCount}) AS g;`);
    if (countRows(sourceUrl) !== rowCount) fail('source drill fixture did not reach expected row count');

    run('pg_dump', [sourceUrl, '-Fc', '--no-owner', '--no-acl', '-n', SCHEMA, '-f', dumpFile]);
    if (!existsSync(dumpFile)) fail('drill backup was not created');

    psql(sourceUrl, `DELETE FROM ${TABLE};`);
    if (countRows(sourceUrl) !== 0) fail('rogue DELETE simulation did not remove source drill rows');

    const replicaTimeoutSeconds = Number(process.env.DRILL_REPLICA_TIMEOUT_SECONDS || 30);
    const replicaResults = replicaUrls.map((url, index) => ({
      replica: index + 1,
      deleteObserved: waitForReplicaDelete(url, replicaTimeoutSeconds),
    }));
    if (replicaResults.some((item) => !item.deleteObserved)) fail('a configured replica did not reproduce the destructive DELETE within the deadline');

    psql(restoreUrl, `DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;`);
    run('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-acl', '-d', restoreUrl, dumpFile]);
    if (countRows(restoreUrl) !== rowCount) fail('cold-backup restore drill did not recover expected rows');

    console.log(JSON.stringify({
      status: 'PASS',
      sourceDeleteObserved: true,
      replicaProof: replicaUrls.length ? 'PASS' : 'NOT_CONFIGURED',
      replicasChecked: replicaResults.length,
      restoredRows: rowCount,
      destructiveSourceWasDisposable: true,
    }));
  } finally {
    for (const url of [sourceUrl, restoreUrl]) {
      try { psql(url, `DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;`); } catch { /* bounded cleanup only */ }
    }
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[db:rogue-delete-drill] FAIL: ${error.message}`);
  process.exitCode = 1;
});
