// @vitest-environment node
/**
 * Static-analysis contract for the feedback-nudge UI: dialog renders avatar
 * chip + persona opener, settings renders 1 master + 5 per-avatar sliders,
 * and neither ships pre-refactor or forbidden copy.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..", "..", "..");

function read(p: string): string {
  return fs.readFileSync(path.join(root, p), "utf8");
}

describe("FeedbackNudgeDialog avatar wiring", () => {
  const dlg = read(path.join("client", "src", "components", "feedback-nudge-dialog.tsx"));

  it("embeds the glossy AvatarOrb primitive with a resolved avatarKey variant", () => {
    expect(dlg).toContain("AvatarOrb");
    expect(dlg).toMatch(/variant=\{avatarKey\}/);
  });

  it("uses getAvatarForSource (shared source map) as its fallback resolver", () => {
    expect(dlg).toContain("getAvatarForSource");
  });

  it("subscribes to /api/gamification/avatar-voices for persona openers", () => {
    expect(dlg).toContain('"/api/gamification/avatar-voices"');
  });

  it("routes the primary action to /feedback?avatar=<avatarKey>", () => {
    expect(dlg).toMatch(/\/feedback\?/);
    expect(dlg).toMatch(/avatar:\s*avatarKey/);
  });

  it("exposes fallback openers for every avatar when the voices query fails", () => {
    expect(dlg).toContain("FALLBACK_OPENERS");
    for (const key of ["archetype", "productivity", "mood", "social", "lazy"]) {
      expect(dlg).toContain(`${key}:`);
    }
  });

  it("does not ship pre-refactor 'Share a quick thought?' copy", () => {
    /* Previous generic title replaced by persona-specific copy. */
    expect(dlg).not.toContain("Share a quick thought?");
  });

  it("does not embed the forbidden push-failure toast", () => {
    expect(dlg).not.toContain("Push key missing");
  });
});

describe("FeedbackNudgeSliders settings UI", () => {
  const sliders = read(path.join("client", "src", "components", "settings", "feedback-nudge-sliders.tsx"));

  it("renders one master slider and exactly one slider per avatar key", () => {
    expect(sliders).toContain('aria-label="Master feedback frequency"');
    expect(sliders).toMatch(/FEEDBACK_AVATAR_KEYS\.map/);
    expect(sliders).toContain("Feedback frequency for ");
    expect(sliders).toContain("FEEDBACK_AVATAR_NAMES[key]");
  });

  it("debounces write-through to saveFeedbackNudgePrefs", () => {
    expect(sliders).toContain("saveFeedbackNudgePrefs");
    expect(sliders).toContain("DEBOUNCE_MS");
    expect(sliders).toMatch(/setTimeout\(/);
    expect(sliders).toMatch(/clearTimeout\(/);
  });

  it("offers a reset-to-defaults button", () => {
    expect(sliders).toMatch(/Reset to defaults/);
  });
});

describe("hybrid feedback prefs persistence", () => {
  const hook = read(path.join("client", "src", "hooks", "use-notification-mode.tsx"));

  it("writes the server-returned feedbackNudgePrefs through to localStorage cache", () => {
    expect(hook).toContain("writeFeedbackPrefsCache");
    expect(hook).toMatch(/feedbackNudgePrefs/);
  });

  it("exposes saveFeedbackNudgePrefs on the context value", () => {
    expect(hook).toContain("saveFeedbackNudgePrefs");
  });
});
