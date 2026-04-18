// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

describe("adherence routes wiring", () => {
  it("registers user adherence APIs", () => {
    const src = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(src).toContain('app.get("/api/adherence/interventions"');
    expect(src).toContain('app.post("/api/adherence/interventions/:id/acknowledge"');
    expect(src).toContain('app.post("/api/adherence/refresh"');
  });
});

