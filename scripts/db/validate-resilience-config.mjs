#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONFIG = 'config/database-resilience.json';
const DEFAULT_WRITER_POLICY = 'infra/aws/cold-backup-live-writer-policy.json';
const DEFAULT_READER_POLICY = 'infra/aws/cold-backup-recovery-reader-policy.json';

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function positiveInteger(value, label) {
  invariant(Number.isInteger(value) && value > 0, `${label} must be a positive integer`);
}

export function validateResilienceConfig(config) {
  invariant(config && typeof config === 'object', 'resilience config must be an object');
  invariant(config.schemaVersion === 1, 'schemaVersion must equal 1');
  invariant(config.provider === 'neon', "provider must be 'neon' for the current AxTask production architecture");

  const ha = config.highAvailability;
  invariant(ha && typeof ha === 'object', 'highAvailability is required');
  invariant(ha.mode === 'managed-service', "highAvailability.mode must be 'managed-service'");
  invariant(ha.stableWriterEndpointRequired === true, 'HA requires a stable writer endpoint');
  invariant(ha.automaticClientReconnectRequired === true, 'HA requires automatic client reconnect');
  invariant(ha.providerStorageReplicationRequired === true, 'HA requires provider storage replication');
  positiveInteger(ha.minimumStorageFailureDomains, 'highAvailability.minimumStorageFailureDomains');
  invariant(ha.minimumStorageFailureDomains >= 3, 'HA requires at least three storage failure domains');
  invariant(ha.readReplicasCountAsFailoverReplicas === false, 'Neon read replicas must not be counted as failover/data replicas');
  positiveInteger(ha.failoverRtoSeconds, 'highAvailability.failoverRtoSeconds');
  invariant(ha.failoverRtoSeconds <= 60, 'HA failover RTO must be 60 seconds or less');
  positiveInteger(ha.drillIntervalDays, 'highAvailability.drillIntervalDays');
  invariant(ha.drillMustUseNonProductionTarget === true, 'HA drills must use a non-production target');

  const dr = config.disasterRecovery;
  invariant(dr && typeof dr === 'object', 'disasterRecovery is required');

  const pitr = dr.pointInTimeRecovery;
  invariant(pitr?.required === true, 'point-in-time recovery must be required');
  positiveInteger(pitr.minimumHistoryHours, 'disasterRecovery.pointInTimeRecovery.minimumHistoryHours');
  invariant(pitr.minimumHistoryHours >= 24, 'PITR history target must be at least 24 hours');

  const backup = dr.coldBackup;
  invariant(backup && typeof backup === 'object', 'disasterRecovery.coldBackup is required');
  positiveInteger(backup.intervalHours, 'disasterRecovery.coldBackup.intervalHours');
  invariant(backup.intervalHours <= 6, 'cold backups must run at least every six hours');
  invariant(backup.format === 'pg_dump-custom', "cold backup format must be 'pg_dump-custom'");
  invariant(backup.storage === 's3-object-lock', "cold backup storage must be 's3-object-lock'");
  invariant(backup.versioningRequired === true, 'cold backup bucket versioning must be required');
  invariant(backup.objectLockRequired === true, 'cold backup Object Lock must be required');
  invariant(backup.objectLockMode === 'COMPLIANCE', "Object Lock mode must be 'COMPLIANCE'");
  positiveInteger(backup.minimumRetentionDays, 'disasterRecovery.coldBackup.minimumRetentionDays');
  invariant(backup.minimumRetentionDays >= 30, 'cold backup retention must be at least 30 days');
  invariant(backup.liveIdentityDeleteAllowed === false, 'live backup identity must not be able to delete backups');
  invariant(backup.liveIdentityLifecycleMutationAllowed === false, 'live backup identity must not be able to change lifecycle policy');
  invariant(backup.restoreIdentitySeparated === true, 'restore identity must be separate from the live writer identity');

  const drill = dr.restoreDrill;
  invariant(drill && typeof drill === 'object', 'disasterRecovery.restoreDrill is required');
  positiveInteger(drill.intervalDays, 'disasterRecovery.restoreDrill.intervalDays');
  invariant(drill.intervalDays <= 30, 'restore drills must run at least monthly');
  invariant(drill.exactManifestRequired === true, 'restore drills must require the exact manifest');
  invariant(drill.disposableRestoreTargetRequired === true, 'restore drills must use a disposable restore target');
  invariant(drill.destructiveSourceMustBeNonProduction === true, 'destructive drills must use a non-production source');

  return config;
}

function actionSet(policy, effect) {
  return new Set(
    (policy.Statement || [])
      .filter((statement) => statement.Effect === effect)
      .flatMap((statement) => Array.isArray(statement.Action) ? statement.Action : [statement.Action])
      .filter(Boolean),
  );
}

export function validateLiveWriterPolicy(policy) {
  const allow = actionSet(policy, 'Allow');
  const deny = actionSet(policy, 'Deny');
  invariant(allow.has('s3:PutObject'), 'live writer policy must allow s3:PutObject');
  for (const action of ['s3:DeleteObject', 's3:DeleteObjectVersion', 's3:PutLifecycleConfiguration', 's3:BypassGovernanceRetention']) {
    invariant(deny.has(action), `live writer policy must explicitly deny ${action}`);
    invariant(!allow.has(action), `live writer policy must not allow ${action}`);
  }
  invariant(!allow.has('s3:GetObject') && !allow.has('s3:GetObjectVersion'), 'live writer identity must not have backup data read permissions');
  return policy;
}

export function validateRecoveryReaderPolicy(policy) {
  const allow = actionSet(policy, 'Allow');
  const deny = actionSet(policy, 'Deny');
  invariant(allow.has('s3:GetObject') && allow.has('s3:GetObjectVersion'), 'recovery identity must be able to read exact backup versions');
  for (const action of ['s3:PutObject', 's3:DeleteObject', 's3:DeleteObjectVersion', 's3:PutLifecycleConfiguration']) {
    invariant(deny.has(action), `recovery reader policy must explicitly deny ${action}`);
  }
  return policy;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function runValidation({ cwd = process.cwd(), configPath, writerPolicyPath, readerPolicyPath } = {}) {
  const configFile = path.resolve(cwd, configPath || DEFAULT_CONFIG);
  const writerFile = path.resolve(cwd, writerPolicyPath || DEFAULT_WRITER_POLICY);
  const readerFile = path.resolve(cwd, readerPolicyPath || DEFAULT_READER_POLICY);
  validateResilienceConfig(readJson(configFile));
  validateLiveWriterPolicy(readJson(writerFile));
  validateRecoveryReaderPolicy(readJson(readerFile));
  return { configFile, writerFile, readerFile };
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirect) {
  try {
    const result = runValidation();
    console.log(JSON.stringify({
      status: 'PASS',
      config: path.relative(process.cwd(), result.configFile),
      liveWriterPolicy: path.relative(process.cwd(), result.writerFile),
      recoveryReaderPolicy: path.relative(process.cwd(), result.readerFile),
    }));
  } catch (error) {
    console.error(`[db-resilience] FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
