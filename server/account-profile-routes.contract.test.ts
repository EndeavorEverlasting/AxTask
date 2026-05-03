// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const routeSources = [
  path.join(projectRoot, "server", "routes.ts"),
  path.join(projectRoot, "server", "routes", "account.ts"),
]
  .map((filePath) => fs.readFileSync(filePath, "utf8"))
  .join("\n\n");

describe("account profile routes", () => {
  it("registers GET and PATCH /api/account/profile for owner display name and birthday", () => {
    expect(routeSources).toContain('app.get("/api/account/profile"');
    expect(routeSources).toContain('app.patch("/api/account/profile"');
    expect(routeSources).toContain("updateUserAccountProfile");
    expect(routeSources).toContain("isIsoCalendarDateStrict");
  });
});
