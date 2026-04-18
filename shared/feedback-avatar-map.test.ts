// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEEDBACK_AVATAR,
  DEFAULT_FEEDBACK_SOURCE_TO_AVATAR,
  FEEDBACK_AVATAR_BLURBS,
  FEEDBACK_AVATAR_KEYS,
  FEEDBACK_AVATAR_NAMES,
  KNOWN_FEEDBACK_SOURCES,
  getAvatarForSource,
  isFeedbackAvatarKey,
} from "./feedback-avatar-map";

describe("feedback-avatar-map", () => {
  it("exposes exactly the five canonical companion keys", () => {
    expect([...FEEDBACK_AVATAR_KEYS].sort()).toEqual([
      "archetype",
      "lazy",
      "mood",
      "productivity",
      "social",
    ]);
  });

  it("every known production source has an explicit mapping", () => {
    for (const source of KNOWN_FEEDBACK_SOURCES) {
      expect(
        DEFAULT_FEEDBACK_SOURCE_TO_AVATAR[source],
        `missing mapping for ${source}`,
      ).toBeDefined();
      expect(FEEDBACK_AVATAR_KEYS).toContain(
        DEFAULT_FEEDBACK_SOURCE_TO_AVATAR[source],
      );
    }
  });

  it("getAvatarForSource resolves known sources", () => {
    expect(getAvatarForSource("task_complete")).toBe("productivity");
    expect(getAvatarForSource("CLASSIFICATION_CONFIRM")).toBe("archetype");
    expect(getAvatarForSource("  recalculate  ")).toBe("lazy");
  });

  it("getAvatarForSource falls back to the default for unknown, empty, or nullish input", () => {
    expect(getAvatarForSource("totally_unknown_source")).toBe(DEFAULT_FEEDBACK_AVATAR);
    expect(getAvatarForSource("")).toBe(DEFAULT_FEEDBACK_AVATAR);
    expect(getAvatarForSource("   ")).toBe(DEFAULT_FEEDBACK_AVATAR);
    expect(getAvatarForSource(null)).toBe(DEFAULT_FEEDBACK_AVATAR);
    expect(getAvatarForSource(undefined)).toBe(DEFAULT_FEEDBACK_AVATAR);
  });

  it("isFeedbackAvatarKey is a proper type-guard", () => {
    expect(isFeedbackAvatarKey("archetype")).toBe(true);
    expect(isFeedbackAvatarKey("mood")).toBe(true);
    expect(isFeedbackAvatarKey("unknown")).toBe(false);
    expect(isFeedbackAvatarKey(42)).toBe(false);
    expect(isFeedbackAvatarKey(undefined)).toBe(false);
  });

  it("provides a display name and blurb for every avatar", () => {
    for (const key of FEEDBACK_AVATAR_KEYS) {
      expect(FEEDBACK_AVATAR_NAMES[key]).toMatch(/\w/);
      expect(FEEDBACK_AVATAR_BLURBS[key]).toMatch(/\w/);
    }
  });

  it("source-to-avatar map covers every nudge source used in client code", () => {
    // This guard catches call sites that introduce a new source string without
    // updating the map. Fails if the KNOWN_FEEDBACK_SOURCES list is shorter
    // than the actually-populated map (i.e. someone added a mapping without
    // listing it as known) or vice versa.
    const mapKeys = Object.keys(DEFAULT_FEEDBACK_SOURCE_TO_AVATAR).sort();
    const known = [...KNOWN_FEEDBACK_SOURCES].sort();
    expect(mapKeys).toEqual(known);
  });
});
