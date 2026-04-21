// @vitest-environment node
import { describe, expect, it } from "vitest";
import { gamificationSkillTreeApiPaths } from "./skill-tree-paths";

describe("gamificationSkillTreeApiPaths", () => {
  it("routes avatar domain to avatar-skills list and unlock", () => {
    expect(gamificationSkillTreeApiPaths("avatar")).toEqual({
      list: "/api/gamification/avatar-skills",
      unlock: "/api/gamification/avatar-skills/unlock",
    });
  });

  it("routes offline domain to offline-skills list and unlock", () => {
    expect(gamificationSkillTreeApiPaths("offline")).toEqual({
      list: "/api/gamification/offline-skills",
      unlock: "/api/gamification/offline-skills/unlock",
    });
  });
});
