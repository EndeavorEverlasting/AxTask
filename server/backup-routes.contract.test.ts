// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const routesPath = path.join(projectRoot, "server", "routes.ts");
const backupServicePath = path.join(projectRoot, "server", "services", "backup-service.ts");
const backupRoutesPath = path.join(projectRoot, "server", "routes", "backup.ts");
const accountBackupRoutesPath = path.join(projectRoot, "server", "routes", "account-backup.ts");

describe("backup routes contract", () => {
  it("registers backup routes in routes.ts", () => {
    const routes = fs.readFileSync(routesPath, "utf8");
    expect(routes).toContain('import { registerBackupRoutes } from "./routes/backup"');
    expect(routes).toContain("registerBackupRoutes(app, requireAuth)");
  });

  it("registers account backup routes in routes.ts", () => {
    const routes = fs.readFileSync(routesPath, "utf8");
    expect(routes).toContain('import { registerAccountBackupRoutes } from "./routes/account-backup"');
    expect(routes).toContain("registerAccountBackupRoutes(app, requireAuth)");
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
  });

  it("backup service reuses buildUserExportBundle", () => {
    const content = fs.readFileSync(backupServicePath, "utf8");
    expect(content).toContain('import { buildUserExportBundle');
    expect(content).toContain("generateLocalBackup");
    expect(content).toContain("getBackupStatus");
  });

  it("backup status returns honest fields", () => {
    const content = fs.readFileSync(backupServicePath, "utf8");
    expect(content).toContain("manualExportAvailable: true");
    expect(content).toContain("automaticBackupsConfigured: false");
    expect(content).toContain("lastServerBackupAt: null");
    expect(content).toContain("restoreDryRunAvailable: true");
  });
});
