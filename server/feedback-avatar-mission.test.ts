// @vitest-environment node
import { describe, expect, it } from "vitest";
import { resolveAvatarKeyForFeedbackMission } from "./feedback-avatar-mission";

describe("resolveAvatarKeyForFeedbackMission", () => {
  it("prefers explicit avatarKey when valid", () => {
    expect(resolveAvatarKeyForFeedbackMission({ avatarKey: "lazy", source: "task_create" })).toBe("lazy");
  });

  it("falls back to source map when avatarKey missing", () => {
    expect(resolveAvatarKeyForFeedbackMission({ source: "task_create" })).toBe("productivity");
  });

  it("defaults to archetype when nothing usable is present", () => {
    expect(resolveAvatarKeyForFeedbackMission({})).toBe("archetype");
    expect(resolveAvatarKeyForFeedbackMission(null)).toBe("archetype");
  });
});
