// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const routesPath = path.join(projectRoot, "server", "routes.ts");

describe("collaboration routes contract", () => {
  it("uses access-aware task reads and view-only collaborator guard", () => {
    const routes = fs.readFileSync(routesPath, "utf8");
    expect(routes).toContain("getAccessibleTasksForUser");
    expect(routes).toContain("getAccessibleTaskForUser");
    expect(routes).toContain('message: "Viewer collaborators are read-only"');
  });

  it("uses handle-first collaborator invites", () => {
    const routes = fs.readFileSync(routesPath, "utf8");
    expect(routes).toContain("getUserByPublicHandle");
    expect(routes).toContain('message: "Handle is required"');
    expect(routes).toContain('role || "viewer"');
  });
});
