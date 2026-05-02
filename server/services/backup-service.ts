import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { buildUserExportBundle, type UserExportBundle } from "../account-backup";
import { createBackupRecord, getLastBackupRecordForUser, getUserBackupPreference } from "../storage";
import { BackupTarget, LocalFileBackupTarget, S3CompatibleBackupTarget } from "./backup-targets";

export type BackupStatus = {
  manualExportAvailable: boolean;
  automaticBackupsConfigured: boolean;
  userAutoBackupEnabled: boolean;
  userPreferredTarget: string;
  lastServerBackupAt: string | null;
  restoreDryRunAvailable: boolean;
};

export function isAutomaticBackupsConfigured(): boolean {
  return process.env.BACKUP_SCHEDULER_ENABLED === "true";
}

export async function getBackupStatus(userId: string): Promise<BackupStatus> {
  const lastRecord = await getLastBackupRecordForUser(userId);
  const pref = await getUserBackupPreference(userId);
  return {
    manualExportAvailable: true,
    automaticBackupsConfigured: isAutomaticBackupsConfigured(),
    userAutoBackupEnabled: pref?.autoBackupEnabled ?? true,
    userPreferredTarget: pref?.preferredTarget ?? "default",
    lastServerBackupAt: lastRecord?.completedAt?.toISOString() ?? null,
    restoreDryRunAvailable: true,
  };
}

function resolveBackupTarget(preferredTarget?: string): BackupTarget {
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
    const data = JSON.stringify(bundle, null, 2);
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
