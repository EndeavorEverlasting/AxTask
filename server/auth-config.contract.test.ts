// @vitest-environment node
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

describe("GET /api/auth/config contract", () => {
  it("includes loginPretext in the JSON response shape", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain("loginPretext");
    expect(routes).toContain("AXTASK_LOGIN_PRETEXT");
  });
});
