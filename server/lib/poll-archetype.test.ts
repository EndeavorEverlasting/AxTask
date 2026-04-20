// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { UserAvatarProfile } from "@shared/schema";
import { dominantArchetypeFromAvatarProfiles } from "./poll-archetype";

function profile(
  overrides: Partial<UserAvatarProfile> & Pick<UserAvatarProfile, "avatarKey" | "archetypeKey" | "totalXp">,
): UserAvatarProfile {
  return {
    id: "id",
    userId: "u",
    displayName: "x",
    level: 1,
    xp: 0,
    mission: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as UserAvatarProfile;
}

describe("dominantArchetypeFromAvatarProfiles", () => {
  it("returns null for empty profiles", () => {
    expect(dominantArchetypeFromAvatarProfiles([])).toBeNull();
  });

  it("picks highest totalXp", () => {
    const rows = [
      profile({ avatarKey: "mood", archetypeKey: "momentum", totalXp: 10 }),
      profile({ avatarKey: "archetype", archetypeKey: "strategy", totalXp: 50 }),
    ];
    expect(dominantArchetypeFromAvatarProfiles(rows)).toBe("strategy");
  });

  it("tie-breaks by smallest avatarKey when totalXp ties", () => {
    const rows = [
      profile({ avatarKey: "social", archetypeKey: "collaboration", totalXp: 5 }),
      profile({ avatarKey: "mood", archetypeKey: "momentum", totalXp: 5 }),
    ];
    expect(dominantArchetypeFromAvatarProfiles(rows)).toBe("momentum");
  });
});
