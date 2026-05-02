import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { buildUserExportBundle, type UserExportBundle } from "../account-backup";
import { createBackupRecord, getLastBackupRecordForUser } from "../storage";

export type BackupStatus = {
  manualExportAvailable: boolean;
  automaticBackupsConfigured: boolean;
  lastServerBackupAt: string | null;
  restoreDryRunAvailable: boolean;
};

export async function getBackupStatus(userId: string): Promise<BackupStatus> {
  const lastRecord = await getLastBackupRecordForUser(userId);
  return {
    manualExportAvailable: true,
    automaticBackupsConfigured: false,
    lastServerBackupAt: lastRecord?.completedAt?.toISOString() ?? null,
    restoreDryRunAvailable: true,
  };
}

export async function generateLocalBackup(
  userId: string,
  outputDir?: string,
): Promise<{ filePath: string; bundle: UserExportBundle }> {
  const pending = await createBackupRecord({
    userId,
    type: "local_json",
    status: "pending",
    metadataJson: JSON.stringify({ mode: "local", outputDir: outputDir ?? process.cwd() }),
  });

  try {
    const bundle = await buildUserExportBundle(userId);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `axtask-backup-${userId.slice(0, 8)}-${timestamp}.json`;
    const dir = outputDir || process.cwd();
    const filePath = path.resolve(dir, fileName);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, JSON.stringify(bundle, null, 2), "utf8");

    await createBackupRecord({
      userId,
      type: "local_json",
      status: "completed",
      pathOrUrl: filePath,
      metadataJson: JSON.stringify({
        mode: "local",
        taskCount: bundle.data.tasks?.length ?? 0,
        previousRecordId: pending.id,
      }),
    });

    return { filePath, bundle };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await createBackupRecord({
      userId,
      type: "local_json",
      status: "failed",
      errorMessage: message,
      metadataJson: JSON.stringify({ previousRecordId: pending.id }),
    });
    throw err;
  }
}
