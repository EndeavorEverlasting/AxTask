// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_FEEDBACK_SOURCE_TO_AVATAR } from "@shared/feedback-avatar-map";
import { SKILL_TREE_SOURCE_RE, resolveSkillUnlockSource } from "./skill-tree-feedback";

describe("resolveSkillUnlockSource", () => {
  it("prefers specialized node-level source when mapped", () => {
    const source = resolveSkillUnlockSource("avatar", "entourage-slots", "companions");
    expect(source).toBe("avatar_skill_unlock_entourage_slots");
    expect(DEFAULT_FEEDBACK_SOURCE_TO_AVATAR[source]).toBe("social");
  });

  it("falls back to branch-level source when node is unmapped but branch is mapped", () => {
    // `guidance-depth` has no specialized row; its branch `guidance` does.
    const source = resolveSkillUnlockSource("avatar", "guidance-depth", "guidance");
    expect(source).toBe("avatar_skill_branch_guidance");
    expect(DEFAULT_FEEDBACK_SOURCE_TO_AVATAR[source]).toBe("archetype");
  });

  it("falls back to tree-level source when neither node nor branch is mapped", () => {
    const source = resolveSkillUnlockSource("avatar", "does-not-exist", "totally-unknown-branch");
    expect(source).toBe("avatar_skill_tree");
    expect(DEFAULT_FEEDBACK_SOURCE_TO_AVATAR[source]).toBe("archetype");
  });

  it("maps offline-tree specialized nodes", () => {
    const source = resolveSkillUnlockSource("offline", "dynamos", "output");
    expect(source).toBe("offline_skill_unlock_dynamos");
    expect(DEFAULT_FEEDBACK_SOURCE_TO_AVATAR[source]).toBe("productivity");
  });

  it("falls back to offline branch (capacity -> Drift) for unmapped nodes", () => {
    const source = resolveSkillUnlockSource("offline", "battery-bank", "capacity");
    expect(source).toBe("offline_skill_branch_capacity");
    expect(DEFAULT_FEEDBACK_SOURCE_TO_AVATAR[source]).toBe("lazy");
  });

  it("falls back to offline_skill_tree when branch is unknown", () => {
    const source = resolveSkillUnlockSource("offline", "unmapped", "unknown-branch");
    expect(source).toBe("offline_skill_tree");
    expect(DEFAULT_FEEDBACK_SOURCE_TO_AVATAR[source]).toBe("productivity");
  });

  it("normalizes kebab-case skill keys and branches to snake_case before lookup", () => {
    expect(resolveSkillUnlockSource("avatar", "ENTOURAGE-SLOTS", "companions")).toBe(
      "avatar_skill_unlock_entourage_slots",
    );
    expect(resolveSkillUnlockSource("avatar", "foo", "Companions")).toBe(
      "avatar_skill_branch_companions",
    );
  });
});

describe("SKILL_TREE_SOURCE_RE", () => {
  it("matches all three skill-tree source shapes", () => {
    expect(SKILL_TREE_SOURCE_RE.test("avatar_skill_unlock_entourage_slots")).toBe(true);
    expect(SKILL_TREE_SOURCE_RE.test("offline_skill_branch_output")).toBe(true);
    expect(SKILL_TREE_SOURCE_RE.test("avatar_skill_tree")).toBe(true);
    expect(SKILL_TREE_SOURCE_RE.test("offline_skill_tree")).toBe(true);
  });

  it("does not match unrelated sources", () => {
    expect(SKILL_TREE_SOURCE_RE.test("task_complete")).toBe(false);
    expect(SKILL_TREE_SOURCE_RE.test("reward_redeem")).toBe(false);
    expect(SKILL_TREE_SOURCE_RE.test("classification_confirm")).toBe(false);
    expect(SKILL_TREE_SOURCE_RE.test("")).toBe(false);
  });
});
