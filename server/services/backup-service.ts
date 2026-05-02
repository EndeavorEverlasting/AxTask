import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { buildUserExportBundle, type UserExportBundle } from "../account-backup";

export type BackupStatus = {
  manualExportAvailable: boolean;
  automaticBackupsConfigured: boolean;
  lastServerBackupAt: string | null;
  restoreDryRunAvailable: boolean;
};

export function getBackupStatus(): BackupStatus {
  return {
    manualExportAvailable: true,
    automaticBackupsConfigured: false,
    lastServerBackupAt: null,
    restoreDryRunAvailable: true,
  };
}

export async function generateLocalBackup(
  userId: string,
  outputDir?: string,
): Promise<{ filePath: string; bundle: UserExportBundle }> {
  const bundle = await buildUserExportBundle(userId);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `axtask-backup-${userId.slice(0, 8)}-${timestamp}.json`;
  const dir = outputDir || process.cwd();
  const filePath = path.resolve(dir, fileName);
  await mkdir(dir, { recursive: true });
  await writeFile(filePath, JSON.stringify(bundle, null, 2), "utf8");
  return { filePath, bundle };
}
