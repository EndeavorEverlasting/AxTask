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

  it("scheduler processes users in configurable chunks", () => {
    const content = fs.readFileSync(backupSchedulerPath, "utf8");
    expect(content).toContain("chunkArray");
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
});
