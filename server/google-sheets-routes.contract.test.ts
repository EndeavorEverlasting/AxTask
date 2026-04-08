// @vitest-environment node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

describe("Google Sheets API route contract (local + Google account sync)", () => {
  it("registers protected Sheets endpoints used by the client", () => {
    const routes = fs.readFileSync(
      path.join(root, "server", "routes.ts"),
      "utf8",
    );
    expect(routes).toContain('app.get("/api/google-sheets/auth-url"');
    expect(routes).toContain('app.post("/api/google-sheets/auth-callback"');
    expect(routes).toContain(
      'app.post("/api/google-sheets/spreadsheet/:id"',
    );
    expect(routes).toContain(
      'app.post("/api/google-sheets/create-spreadsheet"',
    );
    expect(routes).toContain('app.post("/api/google-sheets/export"');
    expect(routes).toContain('app.post("/api/google-sheets/import"');
    expect(routes).toContain('app.post("/api/google-sheets/sync"');
    expect(routes).toContain('app.use("/api/google-sheets", apiLimiter)');
  });

  it("returns stable 400 messages for missing sync payload fields", () => {
    const routes = fs.readFileSync(
      path.join(root, "server", "routes.ts"),
      "utf8",
    );
    expect(routes).toContain(
      "Authorization code required",
    );
    expect(routes).toContain("Access token required");
    expect(routes).toContain(
      "Spreadsheet ID and access token required",
    );
    expect(routes).toContain(
      "Google API credentials not configured. Please check your environment variables.",
    );
  });

  it("sync response maps conflicts array length for the UI", () => {
    const routes = fs.readFileSync(
      path.join(root, "server", "routes.ts"),
      "utf8",
    );
    expect(routes).toContain("conflicts: syncResult.conflicts.length");
    expect(routes).toContain("conflictDetails: syncResult.conflicts");
  });
});
