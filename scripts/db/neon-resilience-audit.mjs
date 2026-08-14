#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';

const CONFIG_PATH = path.resolve('config/database-resilience.json');
const API_BASE = 'https://console.neon.tech/api/v2';

function fail(message) {
  throw new Error(message);
}

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) fail(`${name} is required`);
  return value;
}

async function neonGet(apiKey, pathname) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  if (!response.ok) fail(`Neon API ${pathname} returned HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const apiKey = requireEnv('NEON_API_KEY');
  const projectId = requireEnv('NEON_PROJECT_ID');
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  const minimumHistoryHours = Number(config.disasterRecovery?.pointInTimeRecovery?.minimumHistoryHours || 0);

  const [projectResponse, branchesResponse, endpointsResponse] = await Promise.all([
    neonGet(apiKey, `/projects/${encodeURIComponent(projectId)}`),
    neonGet(apiKey, `/projects/${encodeURIComponent(projectId)}/branches`),
    neonGet(apiKey, `/projects/${encodeURIComponent(projectId)}/endpoints`),
  ]);
  const project = projectResponse.project || projectResponse;
  const branches = branchesResponse.branches || [];
  const endpoints = endpointsResponse.endpoints || [];
  const defaultBranch = branches.find((branch) => branch.primary || branch.default) || branches[0];
  const writerEndpoints = endpoints.filter((endpoint) => endpoint.type === 'read_write' && (!defaultBranch || endpoint.branch_id === defaultBranch.id));
  const historyHours = Number(project.history_retention_seconds || 0) / 3600;

  const checks = {
    pointInTimeHistory: historyHours >= minimumHistoryHours,
    defaultBranchPresent: Boolean(defaultBranch),
    defaultBranchNotArchived: Boolean(defaultBranch && defaultBranch.current_state !== 'archived'),
    writerEndpointPresent: writerEndpoints.length >= 1,
  };
  const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';

  console.log(JSON.stringify({
    status,
    provider: 'neon',
    historyHours,
    requiredHistoryHours: minimumHistoryHours,
    defaultBranchState: defaultBranch?.current_state || 'missing',
    writerEndpointCount: writerEndpoints.length,
    checks,
    note: 'Neon read replicas share the same storage and are intentionally not counted as independent disaster-recovery copies.',
  }));
  if (status !== 'PASS') process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[db:neon-resilience-audit] FAIL: ${error.message}`);
  process.exitCode = 1;
});
