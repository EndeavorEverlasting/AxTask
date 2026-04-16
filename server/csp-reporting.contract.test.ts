// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

describe("csp reporting wiring", () => {
  it("keeps strict CSP while emitting report-only telemetry", () => {
    const src = fs.readFileSync(path.join(root, "server", "index.ts"), "utf8");
    expect(src).toContain("scriptSrc: [\"'self'\"]");
    expect(src).toContain("Content-Security-Policy-Report-Only");
    expect(src).toContain("/csp-report");
    expect(src).toContain("[csp-report]");
  });
});

