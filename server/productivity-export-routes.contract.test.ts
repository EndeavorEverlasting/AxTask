// @vitest-environment node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

describe("Productivity export route contract", () => {
  it("registers coin-gated checklist PDF download (POST)", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain('app.post("/api/checklist/:date/download"');
    expect(routes).toContain("generateChecklistPdfBuffer");
    expect(routes).toContain("debitProductivityExport");
  });

  it("registers paid spreadsheet and task report exports", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain('app.post("/api/tasks/export/spreadsheet"');
    expect(routes).toContain('app.post("/api/tasks/:id/report"');
    expect(routes).toContain("tasksToCsvBuffer");
    expect(routes).toContain("generateTaskReportPdfBuffer");
  });

  it("exposes productivity export prices for the client", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain('app.get("/api/gamification/productivity-export-prices"');
    expect(routes).toContain("productivityExportsFreeInDev");
  });

  it("returns INSUFFICIENT_COINS from debit helper", () => {
    const debit = fs.readFileSync(path.join(root, "server", "productivity-export-debit.ts"), "utf8");
    expect(debit).toContain("INSUFFICIENT_COINS");
    expect(debit).toContain("402");
  });
});
