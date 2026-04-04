// @vitest-environment node
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

describe("device refresh route contract", () => {
  it("registers POST /api/auth/refresh", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain('app.post("/api/auth/refresh"');
    expect(routes).toContain("performAuthRefresh");
  });
});
