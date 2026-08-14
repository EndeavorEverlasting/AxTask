#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function fail(message) {
  throw new Error(message);
}

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) fail(`${name} is required`);
  return value;
}

function argValue(name) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || '';
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

function isLoopbackDatabaseUrl(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

function databaseFingerprint(value) {
  const url = new URL(value);
  const database = url.pathname.replace(/^\//, '') || 'postgres';
  return createHash('sha256')
    .update(`${url.hostname.toLowerCase()}:${url.port || '5432'}/${database}`)
    .digest('hex')
    .slice(0, 20);
}

function recoveryAwsArgs() {
  const args = [];
  const region = String(process.env.COLD_BACKUP_AWS_REGION || process.env.AWS_REGION || '').trim();
  const profile = String(process.env.COLD_BACKUP_RECOVERY_AWS_PROFILE || '').trim();
  if (region) args.push('--region', region);
  if (profile) args.push('--profile', profile);
  return args;
}

function download(uri, destination) {
  run('aws', ['s3', 'cp', uri, destination, '--only-show-errors', ...recoveryAwsArgs()]);
}

async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function main() {
  const manifestUri = argValue('manifest-s3-uri');
  if (!/^s3:\/\/[^/]+\/.+\.manifest\.json$/.test(manifestUri)) {
    fail('--manifest-s3-uri=s3://bucket/path/file.manifest.json is required');
  }

  const restoreUrl = requireEnv('RESTORE_DATABASE_URL');
  if (!isLoopbackDatabaseUrl(restoreUrl)) {
    fail('RESTORE_DATABASE_URL must be a loopback/disposable PostgreSQL database');
  }

  const sourceUrl = String(process.env.DATABASE_URL || '').trim();
  if (sourceUrl && databaseFingerprint(sourceUrl) === databaseFingerprint(restoreUrl)) {
    fail('RESTORE_DATABASE_URL must be different from DATABASE_URL');
  }

  toolExists('aws');
  toolExists('pg_restore');
  toolExists('psql');

  const workDir = path.join(os.tmpdir(), `axtask-cold-restore-${process.pid}-${randomUUID()}`);
  mkdirSync(workDir, { recursive: false, mode: 0o700 });
  const manifestFile = path.join(workDir, 'manifest.json');
  const dumpFile = path.join(workDir, 'backup.dump');

  try {
    download(manifestUri, manifestFile);
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    if (manifest.schemaVersion !== 1 || manifest.backupKind !== 'cold-db-dump') {
      fail('manifest is not an AxTask cold database backup');
    }
    if (manifest.format !== 'pg_dump-custom') fail('manifest backup format is unsupported');
    if (manifest.s3?.manifestUri !== manifestUri) fail('manifest self-reference does not match requested exact manifest URI');
    if (!/^s3:\/\/[^/]+\/.+\.dump$/.test(manifest.s3?.dumpUri || '')) fail('manifest dump URI is invalid');
    if (!/^[a-f0-9]{64}$/.test(manifest.sha256 || '')) fail('manifest SHA-256 is invalid');

    download(manifest.s3.dumpUri, dumpFile);
    if (!existsSync(dumpFile) || statSync(dumpFile).size !== Number(manifest.byteSize)) {
      fail('downloaded dump byte size does not match manifest');
    }
    const digest = await sha256File(dumpFile);
    if (digest !== manifest.sha256) fail('downloaded dump SHA-256 does not match manifest');

    run('pg_restore', [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-acl',
      '-d',
      restoreUrl,
      dumpFile,
    ]);
    const probe = run('psql', [restoreUrl, '-X', '-A', '-t', '-q', '-c', 'SELECT 1;'], { capture: true });
    if (probe.split(/\s+/).filter(Boolean).at(-1) !== '1') fail('restored database connectivity probe failed');

    console.log(JSON.stringify({
      status: 'PASS',
      manifestUri,
      dumpUri: manifest.s3.dumpUri,
      sha256: digest,
      restoredToDisposableTarget: true,
      sourceFingerprint: manifest.databaseFingerprint,
    }));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[db:cold-restore] FAIL: ${error.message}`);
  process.exitCode = 1;
});
