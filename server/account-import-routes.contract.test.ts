// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const accountBackupRoutesPath = path.join(projectRoot, "server", "routes", "account-backup.ts");

describe("account import route contracts", () => {
  it("uses one migration-export predicate for challenge and import handlers", () => {
    const routes = fs.readFileSync(accountBackupRoutesPath, "utf8");

    expect(routes).toContain("export function isMigrationUserExportBundle(");
    expect(routes).toContain("if (isMigrationUserExportBundle(req.body?.bundle))");
    expect(routes).toContain("if (isMigrationUserExportBundle(body.bundle))");
  });

  it("requires migration identity rather than treating semantic task data as a migration export", () => {
    const routes = fs.readFileSync(accountBackupRoutesPath, "utf8");
    const helperStart = routes.indexOf("export function isMigrationUserExportBundle(");
    const helperEnd = routes.indexOf("export function registerAccountBackupRoutes");

    expect(helperStart).toBeGreaterThan(-1);
    expect(helperEnd).toBeGreaterThan(helperStart);

    const helperBlock = routes.slice(helperStart, helperEnd);
    expect(helperBlock).toContain('metadata.exportMode === "user"');
    expect(helperBlock).toContain("metadata.schemaVersion === 1");
    expect(helperBlock).toContain("Array.isArray(data.users)");
    expect(helperBlock).toContain("data.users.length > 0");
    expect(helperBlock).not.toContain("Array.isArray(data.tasks)");
    expect(helperBlock).not.toContain("Array.isArray(data.userBadges)");
    expect(helperBlock).not.toContain("Array.isArray(data.coinTransactions)");
  });
});
