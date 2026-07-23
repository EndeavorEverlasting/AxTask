import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const avatarRoutes = fs.readFileSync(path.join(root, "server", "routes", "avatar.ts"), "utf8");
const service = fs.readFileSync(
  path.join(root, "server", "services", "leaderboard-service.ts"),
  "utf8",
);
const monolithicStorage = fs.readFileSync(path.join(root, "server", "storage.ts"), "utf8");

describe("leaderboard route architecture", () => {
  it("registers an authenticated validated GET route", () => {
    expect(avatarRoutes).toContain('app.get("/api/leaderboard", requireAuth');
    expect(avatarRoutes).toContain("leaderboardQuerySchema.parse");
    expect(avatarRoutes).toContain('z.enum(["coins", "streak", "contributions"])');
    expect(avatarRoutes).toContain('z.enum(["all", "week"])');
    expect(avatarRoutes).toContain('message: "Invalid leaderboard query"');
  });

  it("keeps leaderboard query logic in a focused service", () => {
    expect(avatarRoutes).toContain('from "../services/leaderboard-service"');
    expect(service).toContain("export async function getLeaderboard");
    expect(service).toContain("classificationContributions");
    expect(service).toContain("communityReplies");
    expect(service).toContain("userOfflineSkills");
    expect(service).toContain("userAvatarSkills");
    expect(monolithicStorage).not.toContain("export async function getLeaderboard(");
  });

  it("does not revive obsolete Replit leaderboard symbols", () => {
    expect(service).not.toContain("forumPosts");
    expect(service).not.toContain("forumComments");
    expect(service).not.toContain("skillUnlocks");
  });
});
