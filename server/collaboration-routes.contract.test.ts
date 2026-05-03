// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");
const routes = [
  path.join(projectRoot, "server", "routes.ts"),
  path.join(projectRoot, "server", "routes", "task-collaboration.ts"),
]
  .map((filePath) => fs.readFileSync(filePath, "utf8"))
  .join("\n\n");

describe("collaboration routes contract", () => {
  it("uses access-aware task reads and view-only collaborator guard", () => {
    expect(routes).toContain("getAccessibleTasksForUser");
    expect(routes).toContain("getAccessibleTaskForUser");
    expect(routes).toContain('message: "Viewer collaborators are read-only"');
  });

  it("uses handle-first collaborator invites", () => {
    expect(routes).toContain("getUserByPublicHandle");
    expect(routes).toContain('message: "Handle is required"');
    expect(routes).toContain('role || "viewer"');
  });

  it("registers authenticated invite preview endpoint", () => {
    expect(routes).toContain('app.post("/api/invites/preview"');
    expect(routes).toContain("getInvitePreviewByPublicHandle");
    expect(routes).toContain("toPublicInviteUserPreview");
  });

  it("registers invite handle suggestions and recent collaborators endpoints", () => {
    expect(routes).toContain('app.get("/api/invites/handle-suggestions"');
    expect(routes).toContain('app.get("/api/invites/recent-collaborators"');
    expect(routes).toContain("searchPublicInvitePreviewsByPrefix");
    expect(routes).toContain("getRecentInviteCollaboratorPreviews");
  });
});
