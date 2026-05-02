import { writeFile, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { buildUserExportBundle, type UserExportBundle } from "../account-backup";
import { createBackupRecord, getLastBackupRecordForUser, getUserBackupPreference, countRecentBackupFailuresForUser } from "../storage";
import { BackupTarget, LocalFileBackupTarget, S3CompatibleBackupTarget, MultiS3BackupTarget } from "./backup-targets";
import { encryptBackup, decryptBackup, compressBackup, decompressBackup } from "./backup-crypto";

export type BackupStatus = {
  manualExportAvailable: boolean;
  automaticBackupsConfigured: boolean;
  userAutoBackupEnabled: boolean;
  userPreferredTarget: string;
  lastServerBackupAt: string | null;
  consecutiveFailures: number;
  restoreDryRunAvailable: boolean;
};

export function isAutomaticBackupsConfigured(): boolean {
  return process.env.BACKUP_SCHEDULER_ENABLED === "true";
}

export async function getBackupStatus(userId: string): Promise<BackupStatus> {
  const lastRecord = await getLastBackupRecordForUser(userId);
  const pref = await getUserBackupPreference(userId);
  const consecutiveFailures = await countRecentBackupFailuresForUser(userId);
  return {
    manualExportAvailable: true,
    automaticBackupsConfigured: isAutomaticBackupsConfigured(),
    userAutoBackupEnabled: pref?.autoBackupEnabled ?? true,
    userPreferredTarget: pref?.preferredTarget ?? "default",
    lastServerBackupAt: lastRecord?.completedAt?.toISOString() ?? null,
    consecutiveFailures,
    restoreDryRunAvailable: true,
  };
}

export function resolveBackupTarget(preferredTarget?: string): BackupTarget {
  // Multi-target S3 replication via BACKUP_S3_TARGETS_JSON
  const multiTargetsJson = process.env.BACKUP_S3_TARGETS_JSON;
  if (multiTargetsJson) {
    try {
      const configs = JSON.parse(multiTargetsJson);
      if (Array.isArray(configs) && configs.length > 0) {
        return new MultiS3BackupTarget(configs);
      }
    } catch {
      console.warn("[backup] BACKUP_S3_TARGETS_JSON is invalid JSON, ignoring");
    }
  }

  const s3Endpoint = process.env.BACKUP_S3_ENDPOINT;
  const s3Bucket = process.env.BACKUP_S3_BUCKET;
  const s3Region = process.env.BACKUP_S3_REGION || "us-east-1";
  const s3AccessKey = process.env.BACKUP_S3_ACCESS_KEY_ID;
  const s3SecretKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY;
  const s3Prefix = process.env.BACKUP_S3_PREFIX;

  // Respect user preference if explicitly set and env supports it
  if (preferredTarget === "s3" && s3Endpoint && s3Bucket && s3AccessKey && s3SecretKey) {
    return new S3CompatibleBackupTarget({
      endpoint: s3Endpoint,
      bucket: s3Bucket,
      region: s3Region,
      accessKeyId: s3AccessKey,
      secretAccessKey: s3SecretKey,
      prefix: s3Prefix,
    });
  }

  if (preferredTarget === "local") {
    return new LocalFileBackupTarget(process.env.BACKUP_LOCAL_DIR || process.cwd());
  }

  // Default resolution from env
  if (s3Endpoint && s3Bucket && s3AccessKey && s3SecretKey) {
    return new S3CompatibleBackupTarget({
      endpoint: s3Endpoint,
      bucket: s3Bucket,
      region: s3Region,
      accessKeyId: s3AccessKey,
      secretAccessKey: s3SecretKey,
      prefix: s3Prefix,
    });
  }

  return new LocalFileBackupTarget(process.env.BACKUP_LOCAL_DIR || process.cwd());
}

export async function generateLocalBackup(
  userId: string,
  outputDir?: string,
): Promise<{ filePath: string; bundle: UserExportBundle }> {
  const pref = await getUserBackupPreference(userId);
  const preferredTarget = pref?.preferredTarget === "default" ? undefined : pref?.preferredTarget;

  const target = outputDir
    ? new LocalFileBackupTarget(outputDir)
    : resolveBackupTarget(preferredTarget ?? undefined);

  const pending = await createBackupRecord({
    userId,
    type: target.name,
    status: "pending",
    metadataJson: JSON.stringify({
      mode: target.name,
      userPreferredTarget: pref?.preferredTarget ?? "default",
      outputDir: outputDir ?? (process.env.BACKUP_LOCAL_DIR || process.cwd()),
      s3Bucket: target instanceof S3CompatibleBackupTarget ? (target as any).opts?.bucket : undefined,
    }),
  });

  try {
    const bundle = await buildUserExportBundle(userId);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `axtask-backup-${userId.slice(0, 8)}-${timestamp}.json`;
    let data = JSON.stringify(bundle, null, 2);
    const sha256 = createHash("sha256").update(data, "utf8").digest("hex");

    let compressionMeta: Record<string, unknown> | undefined;
    if (process.env.BACKUP_COMPRESSION_ENABLED === "true") {
      const { payload, meta } = await compressBackup(data);
      data = payload;
      compressionMeta = meta;
    }

    let encryptionMeta: Record<string, unknown> | undefined;
    const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;
    if (encryptionKey) {
      const { payload, meta } = encryptBackup(data, encryptionKey);
      data = payload;
      encryptionMeta = meta;
    }

    const { pathOrUrl } = await target.writeBackup(fileName, data);

    await createBackupRecord({
      userId,
      type: target.name,
      status: "completed",
      pathOrUrl,
      metadataJson: JSON.stringify({
        mode: target.name,
        taskCount: bundle.data.tasks?.length ?? 0,
        previousRecordId: pending.id,
        sha256,
        compressed: !!compressionMeta,
        compressionMeta: compressionMeta ?? undefined,
        encrypted: !!encryptionMeta,
        encryptionMeta: encryptionMeta ?? undefined,
      }),
    });

    return { filePath: pathOrUrl, bundle };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await createBackupRecord({
      userId,
      type: target.name,
      status: "failed",
      errorMessage: message,
      metadataJson: JSON.stringify({ previousRecordId: pending.id }),
    });
    throw err;
  }
}

/** Re-read a completed backup and verify its SHA-256 hash matches the ledger. */
export async function verifyBackupByRecord(record: {
  pathOrUrl: string | null;
  metadataJson: string | null;
}): Promise<{ ok: boolean; sha256: string; expectedSha256: string | null; error?: string }> {
  if (!record.pathOrUrl) {
    return { ok: false, sha256: "", expectedSha256: null };
  }
  const meta = (() => {
    try {
      return JSON.parse(record.metadataJson ?? "{}");
    } catch {
      return {};
    }
  })();
  const expectedSha256: string | null = meta.sha256 ?? null;

  let raw: Buffer | string;
  if (record.pathOrUrl.startsWith("http://") || record.pathOrUrl.startsWith("https://")) {
    const res = await fetch(record.pathOrUrl);
    if (!res.ok) {
      return { ok: false, sha256: "", expectedSha256 };
    }
    raw = await res.text();
  } else {
    raw = await readFile(record.pathOrUrl, "utf8");
  }

  // If the backup was encrypted, decrypt before computing the hash
  if (meta.encrypted && meta.encryptionMeta && process.env.BACKUP_ENCRYPTION_KEY) {
    try {
      raw = decryptBackup(String(raw), process.env.BACKUP_ENCRYPTION_KEY);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, sha256: "", expectedSha256, error: `decrypt failed: ${msg}` };
    }
  }

  // If the backup was compressed, decompress after decryption
  if (meta.compressed && meta.compressionMeta) {
    try {
      raw = await decompressBackup(String(raw));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, sha256: "", expectedSha256, error: `decompress failed: ${msg}` };
    }
  }

  const sha256 = createHash("sha256").update(raw, "utf8").digest("hex");
  return { ok: sha256 === expectedSha256, sha256, expectedSha256 };
}

/** Lightweight write test to verify the backup target is currently writable. */
export async function testBackupTargetWritable(target: BackupTarget): Promise<boolean> {
  const testPayload = JSON.stringify({ _axtask_backup_probe: true, t: Date.now() });
  const testFileName = `_probe-${Date.now()}.json`;
  try {
    const { pathOrUrl } = await target.writeBackup(testFileName, testPayload);
    // Clean up the probe file for both local and S3 targets
    try {
      await target.deleteBackup(testFileName);
    } catch {
      // ignore cleanup failure — probes are tiny and timestamped, they won't collide
    }
    return true;
  } catch {
    return false;
  }
}
