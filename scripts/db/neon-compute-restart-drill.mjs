#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const API_BASE = 'https://console.neon.tech/api/v2';
const FORBIDDEN_BRANCH_NAMES = new Set(['main', 'master', 'prod', 'production']);

function fail(message) {
  throw new Error(message);
}

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) fail(`${name} is required`);
  return value;
}

function runPsql(databaseUrl) {
  const result = spawnSync('psql', [databaseUrl, '-X', '-A', '-t', '-q', '-c', 'SELECT 1;'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0 && String(result.stdout || '').trim().split(/\s+/).at(-1) === '1';
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

async function neonRequest(apiKey, pathname, init = {}) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!response.ok) fail(`Neon API ${init.method || 'GET'} ${pathname} returned HTTP ${response.status}`);
  return response.json();
}

async function probeReadyUrl(url) {
  if (!url) return null;
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  if (!process.argv.includes('--confirm=NONPROD_COMPUTE_RESTART')) {
    fail('explicit --confirm=NONPROD_COMPUTE_RESTART is required');
  }

  const apiKey = requireEnv('NEON_API_KEY');
  const projectId = requireEnv('NEON_PROJECT_ID');
  const branchId = requireEnv('NEON_DRILL_BRANCH_ID');
  const endpointId = requireEnv('NEON_DRILL_ENDPOINT_ID');
  const databaseUrl = requireEnv('DRILL_DATABASE_URL');
  const readyUrl = String(process.env.DRILL_READY_URL || '').trim();
  const targetRtoSeconds = Number(process.env.DRILL_RTO_SECONDS || 30);
  if (!Number.isFinite(targetRtoSeconds) || targetRtoSeconds <= 0 || targetRtoSeconds > 120) {
    fail('DRILL_RTO_SECONDS must be greater than 0 and no more than 120');
  }

  const [projectResponse, branchResponse, endpointResponse] = await Promise.all([
    neonRequest(apiKey, `/projects/${encodeURIComponent(projectId)}`),
    neonRequest(apiKey, `/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}`),
    neonRequest(apiKey, `/projects/${encodeURIComponent(projectId)}/endpoints/${encodeURIComponent(endpointId)}`),
  ]);
  const project = projectResponse.project || projectResponse;
  const branch = branchResponse.branch || branchResponse;
  let endpoint = endpointResponse.endpoint || endpointResponse;

  if (branch.id !== branchId || endpoint.id !== endpointId) fail('Neon API returned an unexpected drill resource');
  if (endpoint.branch_id !== branchId) fail('drill endpoint is not attached to the declared drill branch');
  if (branch.primary === true || branch.default === true) fail('refusing to restart the default/primary Neon branch');
  if (FORBIDDEN_BRANCH_NAMES.has(String(branch.name || '').trim().toLowerCase())) {
    fail(`refusing to restart branch named '${branch.name}'`);
  }
  if (endpoint.type !== 'read_write') fail('drill endpoint must be a read/write compute');

  const parsedDb = new URL(databaseUrl);
  const endpointHost = String(endpoint.host || '').toLowerCase();
  if (!endpointHost || parsedDb.hostname.toLowerCase() !== endpointHost) {
    fail('DRILL_DATABASE_URL host does not match the declared Neon drill endpoint');
  }

  if (!runPsql(databaseUrl)) fail('drill database is not reachable before restart');
  if (readyUrl && !(await probeReadyUrl(readyUrl))) fail('DRILL_READY_URL is not healthy before restart');

  if (endpoint.current_state !== 'active') {
    const refreshed = await neonRequest(apiKey, `/projects/${encodeURIComponent(projectId)}/endpoints/${encodeURIComponent(endpointId)}`);
    endpoint = refreshed.endpoint || refreshed;
  }
  if (endpoint.current_state !== 'active') fail('drill compute did not become active after the connectivity probe');

  const startedAt = Date.now();
  await neonRequest(
    apiKey,
    `/projects/${encodeURIComponent(projectId)}/endpoints/${encodeURIComponent(endpointId)}/restart`,
    { method: 'POST' },
  );

  let databaseRecoveredAt = null;
  let appRecoveredAt = readyUrl ? null : startedAt;
  const deadline = startedAt + targetRtoSeconds * 1000;
  while (Date.now() <= deadline && (!databaseRecoveredAt || !appRecoveredAt)) {
    if (!databaseRecoveredAt && runPsql(databaseUrl)) databaseRecoveredAt = Date.now();
    if (!appRecoveredAt && await probeReadyUrl(readyUrl)) appRecoveredAt = Date.now();
    if (!databaseRecoveredAt || !appRecoveredAt) sleep(500);
  }

  if (!databaseRecoveredAt) fail(`database did not reconnect within ${targetRtoSeconds} seconds`);
  if (!appRecoveredAt) fail(`application readiness did not recover within ${targetRtoSeconds} seconds`);

  console.log(JSON.stringify({
    status: 'PASS',
    provider: 'neon',
    projectRegion: project.region_id || null,
    branchName: branch.name,
    productionBranch: false,
    databaseRecoveryMs: databaseRecoveredAt - startedAt,
    applicationRecoveryMs: readyUrl ? appRecoveredAt - startedAt : null,
    applicationProbeConfigured: Boolean(readyUrl),
    targetRtoMs: targetRtoSeconds * 1000,
  }));
}

main().catch((error) => {
  console.error(`[db:neon-restart-drill] FAIL: ${error.message}`);
  process.exitCode = 1;
});
