#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statfsSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const GIB = 1024 ** 3;
const CONFIG_PATH = path.resolve('config/database-resilience.json');

function fail(message) {
  throw new Error(message);
}

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) fail(`${name} is required`);
  return value;
}

function run(command, args, { capture = false, env = process.env } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env,
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

function isAbsoluteExistingDir(dir) {
  return path.isAbsolute(dir) && existsSync(dir) && statSync(dir).isDirectory();
}

function requiredCapacityBytes(sourceBytes) {
  return Math.ceil(sourceBytes + Math.max(GIB, sourceBytes * 0.15));
}

function availableBytes(dir) {
  const stats = statfsSync(dir, { bigint: true });
  return Number(stats.bavail * stats.bsize);
}

function databaseFingerprint(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const database = parsed.pathname.replace(/^\//, '') || 'postgres';
  return createHash('sha256')
    .update(`${parsed.hostname.toLowerCase()}:${parsed.port || '5432'}/${database}`)
    .digest('hex')
    .slice(0, 20);
}

async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

function commonAwsArgs() {
  const args = [];
  const region = String(process.env.COLD_BACKUP_AWS_REGION || process.env.AWS_REGION || '').trim();
  const profile = String(process.env.COLD_BACKUP_AWS_PROFILE || '').trim();
  if (region) args.push('--region', region);
  if (profile) args.push('--profile', profile);
  return args;
}

function awsJson(args) {
  const out = run('aws', [...args, ...commonAwsArgs(), '--output', 'json'], { capture: true });
  try {
    return JSON.parse(out || '{}');
  } catch {
    fail(`aws ${args[0]} returned invalid JSON`);
  }
}

function validateBucketProtection(bucket, minimumRetentionDays) {
  const versioning = awsJson(['s3api', 'get-bucket-versioning', '--bucket', bucket]);
  if (versioning.Status !== 'Enabled') fail('cold backup bucket must have S3 Versioning enabled');

  const lock = awsJson(['s3api', 'get-object-lock-configuration', '--bucket', bucket]);
  if (lock.ObjectLockConfiguration?.ObjectLockEnabled !== 'Enabled') {
    fail('cold backup bucket must have S3 Object Lock enabled');
  }
  const retention = lock.ObjectLockConfiguration?.Rule?.DefaultRetention;
  if (retention?.Mode !== 'COMPLIANCE') fail('cold backup bucket default Object Lock mode must be COMPLIANCE');
  const configuredDays = Number(retention.Days || 0) + Number(retention.Years || 0) * 365;
  if (!Number.isFinite(configuredDays) || configuredDays < minimumRetentionDays) {
    fail(`cold backup bucket default retention must be at least ${minimumRetentionDays} days`);
  }
}

function normalizePrefix(value) {
  return String(value || 'axtask-db').trim().replace(/^\/+|\/+$/g, '') || 'axtask-db';
}

function upload(file, uri) {
  const args = ['s3', 'cp', file, uri, '--only-show-errors', ...commonAwsArgs()];
  const kms = String(process.env.COLD_BACKUP_S3_KMS_KEY_ID || '').trim();
  if (kms) args.push('--sse', 'aws:kms', '--sse-kms-key-id', kms);
  else args.push('--sse', 'AES256');
  run('aws', args);
}

function querySourceSize(databaseUrl) {
  const out = run('psql', [databaseUrl, '-X', '-A', '-t', '-q', '-c', 'SELECT pg_database_size(current_database())::bigint;'], { capture: true });
  const bytes = Number(out.split(/\s+/).filter(Boolean).at(-1));
  if (!Number.isFinite(bytes) || bytes <= 0) fail('could not determine source database size');
  return bytes;
}

async function main() {
  const databaseUrl = requireEnv('DATABASE_URL');
  new URL(databaseUrl);
  const stagingDir = requireEnv('COLD_BACKUP_STAGING_DIR');
  if (!isAbsoluteExistingDir(stagingDir)) fail('COLD_BACKUP_STAGING_DIR must be an existing absolute directory outside the repository');
  const relativeToRepo = path.relative(process.cwd(), stagingDir);
  if (relativeToRepo === '' || (!relativeToRepo.startsWith('..') && !path.isAbsolute(relativeToRepo))) {
    fail('COLD_BACKUP_STAGING_DIR must be outside the repository checkout');
  }

  const bucket = requireEnv('COLD_BACKUP_S3_BUCKET');
  const prefix = normalizePrefix(process.env.COLD_BACKUP_S3_PREFIX);
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  const backupPolicy = config.disasterRecovery?.coldBackup;
  if (!backupPolicy) fail('database resilience config is missing disasterRecovery.coldBackup');

  toolExists('pg_dump');
  toolExists('psql');
  toolExists('aws');
  validateBucketProtection(bucket, backupPolicy.minimumRetentionDays);

  const sourceBytes = querySourceSize(databaseUrl);
  const requiredBytes = requiredCapacityBytes(sourceBytes);
  if (availableBytes(stagingDir) < requiredBytes) {
    fail(`COLD_BACKUP_STAGING_DIR requires at least ${requiredBytes} free bytes for this source`);
  }

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const nonce = randomUUID().slice(0, 8);
  const base = `axtask-db-${stamp}-${nonce}`;
  const dumpFile = path.join(stagingDir, `${base}.dump`);
  const manifestFile = path.join(stagingDir, `${base}.manifest.json`);
  if (existsSync(dumpFile) || existsSync(manifestFile)) fail('refusing to overwrite an existing cold backup artifact');

  run('pg_dump', [databaseUrl, '-Fc', '--no-owner', '--no-acl', '-f', dumpFile]);
  if (!existsSync(dumpFile) || statSync(dumpFile).size <= 0) fail('pg_dump did not create a usable dump');

  const sha256 = await sha256File(dumpFile);
  const keyBase = `${prefix}/${day}/${base}`;
  const dumpUri = `s3://${bucket}/${keyBase}.dump`;
  const manifestUri = `s3://${bucket}/${keyBase}.manifest.json`;
  const manifest = {
    schemaVersion: 1,
    app: 'AxTask',
    backupKind: 'cold-db-dump',
    createdAt: now.toISOString(),
    databaseFingerprint: databaseFingerprint(databaseUrl),
    format: 'pg_dump-custom',
    byteSize: statSync(dumpFile).size,
    sha256,
    isolation: 'separate-s3-security-boundary',
    storageProtection: {
      versioningRequired: true,
      objectLockRequired: true,
      objectLockMode: 'COMPLIANCE',
      minimumRetentionDays: backupPolicy.minimumRetentionDays,
      liveIdentityDeleteAllowed: false,
    },
    s3: { bucket, dumpUri, manifestUri },
  };
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });

  upload(dumpFile, dumpUri);
  upload(manifestFile, manifestUri);

  if (String(process.env.COLD_BACKUP_KEEP_LOCAL || '').toLowerCase() !== 'true') {
    unlinkSync(dumpFile);
    unlinkSync(manifestFile);
  }

  console.log(JSON.stringify({
    status: 'PASS',
    backupKind: manifest.backupKind,
    manifestUri,
    dumpUri,
    sha256,
    byteSize: manifest.byteSize,
    localArtifactsRetained: String(process.env.COLD_BACKUP_KEEP_LOCAL || '').toLowerCase() === 'true',
  }));
}

main().catch((error) => {
  console.error(`[db:cold-backup] FAIL: ${error.message}`);
  process.exitCode = 1;
});
