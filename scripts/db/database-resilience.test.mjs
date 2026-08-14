import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateLiveWriterPolicy,
  validateRecoveryReaderPolicy,
  validateResilienceConfig,
} from './validate-resilience-config.mjs';

const validConfig = {
  schemaVersion: 1,
  provider: 'neon',
  highAvailability: {
    mode: 'managed-service',
    stableWriterEndpointRequired: true,
    automaticClientReconnectRequired: true,
    providerStorageReplicationRequired: true,
    minimumStorageFailureDomains: 3,
    readReplicasCountAsFailoverReplicas: false,
    failoverRtoSeconds: 30,
    drillIntervalDays: 90,
    drillMustUseNonProductionTarget: true,
  },
  disasterRecovery: {
    pointInTimeRecovery: { required: true, minimumHistoryHours: 24 },
    coldBackup: {
      intervalHours: 6,
      format: 'pg_dump-custom',
      storage: 's3-object-lock',
      versioningRequired: true,
      objectLockRequired: true,
      objectLockMode: 'COMPLIANCE',
      minimumRetentionDays: 30,
      liveIdentityDeleteAllowed: false,
      liveIdentityLifecycleMutationAllowed: false,
      restoreIdentitySeparated: true,
    },
    restoreDrill: {
      intervalDays: 30,
      exactManifestRequired: true,
      disposableRestoreTargetRequired: true,
      destructiveSourceMustBeNonProduction: true,
    },
  },
};

test('accepts the AxTask HA/DR contract', () => {
  assert.equal(validateResilienceConfig(structuredClone(validConfig)).provider, 'neon');
});

test('rejects treating Neon read replicas as failover replicas', () => {
  const config = structuredClone(validConfig);
  config.highAvailability.readReplicasCountAsFailoverReplicas = true;
  assert.throws(() => validateResilienceConfig(config), /must not be counted/);
});

test('rejects backup cadence slower than six hours', () => {
  const config = structuredClone(validConfig);
  config.disasterRecovery.coldBackup.intervalHours = 12;
  assert.throws(() => validateResilienceConfig(config), /at least every six hours/);
});

test('rejects mutable live backup identity policy', () => {
  const policy = {
    Version: '2012-10-17',
    Statement: [
      { Effect: 'Allow', Action: ['s3:PutObject', 's3:DeleteObject'], Resource: '*' },
      { Effect: 'Deny', Action: ['s3:DeleteObjectVersion', 's3:PutLifecycleConfiguration', 's3:BypassGovernanceRetention'], Resource: '*' },
    ],
  };
  assert.throws(() => validateLiveWriterPolicy(policy), /explicitly deny s3:DeleteObject/);
});

test('accepts separated write-only and recovery-reader identities', () => {
  const writer = {
    Statement: [
      { Effect: 'Allow', Action: ['s3:PutObject'], Resource: '*' },
      { Effect: 'Deny', Action: ['s3:DeleteObject', 's3:DeleteObjectVersion', 's3:PutLifecycleConfiguration', 's3:BypassGovernanceRetention'], Resource: '*' },
    ],
  };
  const reader = {
    Statement: [
      { Effect: 'Allow', Action: ['s3:GetObject', 's3:GetObjectVersion'], Resource: '*' },
      { Effect: 'Deny', Action: ['s3:PutObject', 's3:DeleteObject', 's3:DeleteObjectVersion', 's3:PutLifecycleConfiguration'], Resource: '*' },
    ],
  };
  assert.equal(validateLiveWriterPolicy(writer), writer);
  assert.equal(validateRecoveryReaderPolicy(reader), reader);
});
