// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const accountRoutesPath = path.join(projectRoot, "server", "routes", "account.ts");
const importPagePath = path.join(projectRoot, "client", "src", "pages", "import-export.tsx");

describe("spreadsheet import presence route contract", () => {
  it("registers an authenticated owner-only presence endpoint with the browser chunk ceiling", () => {
    const source = fs.readFileSync(accountRoutesPath, "utf8");

    expect(source).toContain('app.post("/api/account/task-import-presence", requireAuth');
    expect(source).toContain("taskImportPresenceRequestSchema");
    expect(source).toContain(".min(1).max(2_000)");
    expect(source).toContain("storage.getTasks(req.user!.id)");
    expect(source).toContain("verifyTaskImportPresence(requestedTasks, ownedTasks)");
    expect(source).not.toContain("getAccessibleTasksForUser");
  });

  it("keeps the presence ceiling aligned with spreadsheet import chunking", () => {
    const importPage = fs.readFileSync(importPagePath, "utf8");
    expect(importPage).toContain("const CHUNK_SIZE = 2000;");
  });
});
