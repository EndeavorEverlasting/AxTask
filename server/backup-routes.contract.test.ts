// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const routesPath = path.join(projectRoot, "server", "routes.ts");
const backupServicePath = path.join(projectRoot, "server", "services", "backup-service.ts");
const backupRoutesPath = path.join(projectRoot, "server", "routes", "backup.ts");
const backupSchedulerPath = path.join(projectRoot, "server", "workers", "backup-scheduler.ts");
const backupTargetsPath = path.join(projectRoot, "server", "services", "backup-targets.ts");
const backupCryptoPath = path.join(projectRoot, "server", "services", "backup-crypto.ts");
const schemaPath = path.join(projectRoot, "shared", "schema", "ops.ts");
const accountBackupRoutesPath = path.join(projectRoot, "server", "routes", "account-backup.ts");
const accountRoutesPath = path.join(projectRoot, "server", "routes", "account.ts");
const applyMigrationsPath = path.join(projectRoot, "scripts", "apply-migrations.mjs");
const drizzlePushPath = path.join(projectRoot, "scripts", "drizzle-push.mjs");
const migrationAirlockPath = path.join(projectRoot, "scripts", "migration-airlock.mjs");

describe("backup routes contract", () => {
  it("registers backup routes in routes.ts", () => {
    const routes = fs.readFileSync(routesPath, "utf8");
    expect(routes).toContain('import { registerBackupRoutes } from "./routes/backup"');
    expect(routes).toContain("registerBackupRoutes(app, requireAuth, requireAdmin)");
  });

  it("registers account backup routes in routes.ts", () => {
    const routes = fs.readFileSync(routesPath, "utf8");
    expect(routes).toContain('import { registerAccountBackupRoutes } from "./routes/account-backup"');
    expect(routes).toContain("registerAccountBackupRoutes(app, requireAuth)");
  });

  it("registers account routes in routes.ts", () => {
    const routes = fs.readFileSync(routesPath, "utf8");
    expect(routes).toContain('import { registerAccountRoutes } from "./routes/account"');
    expect(routes).toContain("registerAccountRoutes(app, requireAuth)");
  });

  it("exposes account profile, totp, and phone routes in the account route module", () => {
    const content = fs.readFileSync(accountRoutesPath, "utf8");
    expect(content).toContain('"/api/account/profile"');
    expect(content).toContain('"/api/account/totp/status"');
    expect(content).toContain('"/api/account/totp/enrollment/start"');
    expect(content).toContain('"/api/account/totp/enrollment/confirm"');
    expect(content).toContain('"/api/account/totp/disable"');
    expect(content).toContain('"/api/account/phone/verify/confirm"');
  });

  it("exposes account backup export/import routes in the account-backup route module", () => {
    const content = fs.readFileSync(accountBackupRoutesPath, "utf8");
    expect(content).toContain('"/api/account/export"');
    expect(content).toContain('"/api/account/import"');
    expect(content).toContain('"/api/account/import/challenge"');
    expect(content).toContain('"/api/account/data-export-step-up"');
    expect(content).toContain('"/api/account/data-export-step-up-status"');
  });

  it("exposes GET /api/account/backup/status in the backup route module", () => {
    const content = fs.readFileSync(backupRoutesPath, "utf8");
    expect(content).toContain('"/api/account/backup/status"');
    expect(content).toContain("getBackupStatus");
    expect(content).toContain("req.user!.id");
  });

  it("backup status endpoint requires req.user!.id", () => {
    const content = fs.readFileSync(backupRoutesPath, "utf8");
    expect(content).toContain("req.user!.id");
  });

  it("admin backup config endpoint exists", () => {
    const content = fs.readFileSync(backupRoutesPath, "utf8");
    expect(content).toContain('"/api/admin/backup/config"');
    expect(content).toContain("isAutomaticBackupsConfigured");
    expect(content).toContain("BACKUP_S3_ENDPOINT");
    expect(content).toContain("BACKUP_LOCAL_DIR");
  });

  it("backup service reuses buildUserExportBundle and queries ledger", () => {
    const content = fs.readFileSync(backupServicePath, "utf8");
    expect(content).toContain('import { buildUserExportBundle');
    expect(content).toContain("generateLocalBackup");
    expect(content).toContain("getBackupStatus");
    expect(content).toContain("getLastBackupRecordForUser");
    expect(content).toContain("createBackupRecord");
  });

  it("backup targets abstraction exists with local and S3 targets", () => {
    const targetsPath = path.join(projectRoot, "server", "services", "backup-targets.ts");
    const content = fs.readFileSync(targetsPath, "utf8");
    expect(content).toContain("BackupTarget");
    expect(content).toContain("LocalFileBackupTarget");
    expect(content).toContain("S3CompatibleBackupTarget");
    expect(content).toContain("AWS4-HMAC-SHA256");
  });

  it("backup service resolves target from env vars", () => {
    const content = fs.readFileSync(backupServicePath, "utf8");
    expect(content).toContain("BACKUP_S3_ENDPOINT");
    expect(content).toContain("BACKUP_S3_BUCKET");
    expect(content).toContain("S3CompatibleBackupTarget");
    expect(content).toContain("LocalFileBackupTarget");
  });

  it("backup status returns honest fields", () => {
    const content = fs.readFileSync(backupServicePath, "utf8");
    expect(content).toContain("manualExportAvailable: true");
    expect(content).toContain("isAutomaticBackupsConfigured()");
    expect(content).toContain("lastServerBackupAt");
    expect(content).toContain("restoreDryRunAvailable: true");
    expect(content).toContain("userAutoBackupEnabled");
    expect(content).toContain("userPreferredTarget");
    expect(content).toContain("consecutiveFailures");
  });

  it("schema defines userBackupPreferences table", () => {
    const content = fs.readFileSync(schemaPath, "utf8");
    expect(content).toContain("userBackupPreferences");
    expect(content).toContain("autoBackupEnabled");
    expect(content).toContain("preferredTarget");
  });

  it("backup service queries user preferences", () => {
    const content = fs.readFileSync(backupServicePath, "utf8");
    expect(content).toContain("getUserBackupPreference");
  });

  it("scheduler respects user autoBackupEnabled preference", () => {
    const content = fs.readFileSync(backupSchedulerPath, "utf8");
    expect(content).toContain("getUserBackupPreference");
    expect(content).toContain("autoBackupEnabled");
    expect(content).toContain("skipped");
  });

  it("backup routes expose user preferences PATCH endpoint", () => {
    const content = fs.readFileSync(backupRoutesPath, "utf8");
    expect(content).toContain('"/api/account/backup/preferences"');
    expect(content).toContain("upsertUserBackupPreference");
  });

  it("backup routes expose admin health endpoint", () => {
    const content = fs.readFileSync(backupRoutesPath, "utf8");
    expect(content).toContain('"/api/admin/backup/health"');
    expect(content).toContain("latestBackupRecord");
    expect(content).toContain("testBackupTargetWritable");
    expect(content).toContain("resolveBackupTarget");
  });

  it("backup routes expose admin verify endpoint", () => {
    const content = fs.readFileSync(backupRoutesPath, "utf8");
    expect(content).toContain('"/api/admin/backup/verify"');
    expect(content).toContain("verifyBackupByRecord");
  });

  it("backup service computes and stores sha256 hash", () => {
    const content = fs.readFileSync(backupServicePath, "utf8");
    expect(content).toContain("createHash(\"sha256\")");
    expect(content).toContain("sha256");
    expect(content).toContain("verifyBackupByRecord");
    expect(content).toContain("testBackupTargetWritable");
  });

  it("scheduler processes users in configurable pages", () => {
    const content = fs.readFileSync(backupSchedulerPath, "utf8");
    expect(content).toContain("getUsersPaginated");
    expect(content).not.toContain("getAllUsers");
    expect(content).toContain("BACKUP_SCHEDULER_BATCH_SIZE");
    expect(content).toContain("batchSize");
  });

  it("registers task attachment routes in routes.ts", () => {
    const routes = fs.readFileSync(routesPath, "utf8");
    expect(routes).toContain('import { registerTaskAttachmentRoutes } from "./routes/task-attachments"');
    expect(routes).toContain("registerTaskAttachmentRoutes(app, requireAuth)");
  });

  it("exposes task attachment routes in the task-attachments route module", () => {
    const content = fs.readFileSync(
      path.join(projectRoot, "server", "routes", "task-attachments.ts"),
      "utf8",
    );
    expect(content).toContain('"/api/tasks/:taskId/attachments"');
    expect(content).toContain('"/api/tasks/:taskId/attachments/link"');
  });

  it("registers task collaboration routes in routes.ts", () => {
    const routes = fs.readFileSync(routesPath, "utf8");
    expect(routes).toContain('import { registerTaskCollaborationRoutes } from "./routes/task-collaboration"');
    expect(routes).toContain("registerTaskCollaborationRoutes(app, requireAuth)");
  });

  it("exposes task collaboration routes in the task-collaboration route module", () => {
    const content = fs.readFileSync(
      path.join(projectRoot, "server", "routes", "task-collaboration.ts"),
      "utf8",
    );
    expect(content).toContain('"/api/tasks/shared"');
    expect(content).toContain('"/api/tasks/:id/collaborators"');
  });

  it("registers pattern routes in routes.ts", () => {
    const routes = fs.readFileSync(routesPath, "utf8");
    expect(routes).toContain('import { registerPatternRoutes } from "./routes/patterns"');
    expect(routes).toContain("registerPatternRoutes(app, requireAuth)");
  });

  it("exposes pattern routes in the patterns route module", () => {
    const content = fs.readFileSync(
      path.join(projectRoot, "server", "routes", "patterns.ts"),
      "utf8",
    );
    expect(content).toContain('"/api/patterns/insights"');
    expect(content).toContain('"/api/patterns/learn"');
    expect(content).toContain('"/api/patterns/suggest-deadline"');
  });

  it("backup targets support deleteBackup", () => {
    const content = fs.readFileSync(backupTargetsPath, "utf8");
    expect(content).toContain("deleteBackup");
    expect(content).toContain("LocalFileBackupTarget");
    expect(content).toContain("S3CompatibleBackupTarget");
    expect(content).toContain("DELETE");
    expect(content).toContain("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("S3 target retries transient errors with exponential backoff", () => {
    const content = fs.readFileSync(backupTargetsPath, "utf8");
    expect(content).toContain("retryFetch");
    expect(content).toContain("isTransientError");
    expect(content).toContain("exponential");
    expect(content).toContain("retries");
    expect(content).toContain("retryDelayMs");
  });

  it("migration airlock script exists and checks backup_records", () => {
    const content = fs.readFileSync(migrationAirlockPath, "utf8");
    expect(content).toContain("backup_records");
    expect(content).toContain("status = 'completed'");
    expect(content).toContain("sha256");
    expect(content).toContain("--skip");
    expect(content).toContain("--verify");
  });

  it("registers alarm routes in routes.ts", () => {
    const routes = fs.readFileSync(routesPath, "utf8");
    expect(routes).toContain('import { registerAlarmRoutes } from "./routes/alarms"');
    expect(routes).toContain("registerAlarmRoutes(app, requireAuth)");
  });

  it("exposes alarm snapshot and companion routes in the alarms route module", () => {
    const content = fs.readFileSync(
      path.join(projectRoot, "server", "routes", "alarms.ts"),
      "utf8",
    );
    expect(content).toContain('"/api/alarm-snapshots"');
    expect(content).toContain('"/api/alarm-capabilities"');
    expect(content).toContain('"/api/alarm-companion/apply"');
  });

  it("registers collaboration routes in routes.ts", () => {
    const routes = fs.readFileSync(routesPath, "utf8");
    expect(routes).toContain('import { registerCollaborationRoutes } from "./routes/collaboration"');
    expect(routes).toContain("registerCollaborationRoutes(app, requireAuth)");
  });

  it("exposes collaboration inbox routes in the collaboration route module", () => {
    const content = fs.readFileSync(
      path.join(projectRoot, "server", "routes", "collaboration.ts"),
      "utf8",
    );
    expect(content).toContain('"/api/collaboration/inbox"');
    expect(content).toContain('"/api/collaboration/inbox/:id/read"');
  });

  it("apply-migrations script wires migration airlock", () => {
    const content = fs.readFileSync(applyMigrationsPath, "utf8");
    expect(content).toContain("migration-airlock.mjs");
    expect(content).toContain("--skip-airlock");
    expect(content).toContain("MIGRATION_SKIP_AIRLOCK");
  });

  it("drizzle-push script wires migration airlock", () => {
    const content = fs.readFileSync(drizzlePushPath, "utf8");
    expect(content).toContain("migration-airlock.mjs");
    expect(content).toContain("--skip-airlock");
    expect(content).toContain("MIGRATION_SKIP_AIRLOCK");
  });

  it("client UI queries backup status and preferences endpoint", () => {
    const uiPath = path.join(projectRoot, "client", "src", "pages", "import-export.tsx");
    const content = fs.readFileSync(uiPath, "utf8");
    expect(content).toContain('"/api/account/backup/status"');
    expect(content).toContain('"/api/account/backup/preferences"');
    expect(content).toContain("Automatic Backup Preferences");
    expect(content).toContain("userAutoBackupEnabled");
    expect(content).toContain("userPreferredTarget");
    expect(content).toContain("consecutiveFailures");
    expect(content).toContain("Last automatic backup failed");
  });

  it("backup crypto module provides AES-256-GCM encrypt and decrypt", () => {
    const content = fs.readFileSync(backupCryptoPath, "utf8");
    expect(content).toContain("encryptBackup");
    expect(content).toContain("decryptBackup");
    expect(content).toContain("aes-256-gcm");
    expect(content).toContain("createCipheriv");
    expect(content).toContain("createDecipheriv");
    expect(content).toContain("randomBytes");
  });

  it("backup service encrypts when BACKUP_ENCRYPTION_KEY is set", () => {
    const content = fs.readFileSync(backupServicePath, "utf8");
    expect(content).toContain("BACKUP_ENCRYPTION_KEY");
    expect(content).toContain("encryptBackup");
    expect(content).toContain("decryptBackup");
    expect(content).toContain("encrypted:");
    expect(content).toContain("encryptionMeta");
  });

  it("migration airlock handles encrypted backup verification", () => {
    const content = fs.readFileSync(migrationAirlockPath, "utf8");
    expect(content).toContain("decryptBackupPayload");
    expect(content).toContain("createDecipheriv");
    expect(content).toContain("aes-256-gcm");
    expect(content).toContain("meta.encrypted");
    expect(content).toContain("BACKUP_ENCRYPTION_KEY");
  });

  it("storage counts recent backup failures for a user", () => {
    const content = fs.readFileSync(
      path.join(projectRoot, "server", "storage.ts"),
      "utf8",
    );
    expect(content).toContain("countRecentBackupFailuresForUser");
    expect(content).toContain('row.status === "failed"');
  });
});
