import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  FEEDBACK_PREFS_CACHE_KEY,
  computeEffectiveIntensity,
  getFeedbackNudgePolicy,
  readFeedbackPrefsCache,
  requestFeedbackNudge,
  writeFeedbackPrefsCache,
} from "./feedback-nudge";

function setMaxIntensity() {
  writeFeedbackPrefsCache({ master: 100, byAvatar: {} });
  localStorage.setItem("axtask.notification.enabled", "true");
}

describe("feedback nudge guardrails", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setMaxIntensity();
  });

  it("enforces cooldown between nudges", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    requestFeedbackNudge("task_create");
    requestFeedbackNudge("task_create");
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    dispatchSpy.mockRestore();
  });

  it("caps nudge attempts per source", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    for (let i = 0; i < 6; i++) {
      requestFeedbackNudge("task_complete");
      localStorage.setItem("axtask.feedbackNudge.lastAt", "0");
      /* clear avatar cooldown too so we only assert per-source cap */
      localStorage.setItem("axtask.feedbackNudge.avatarLastAt", "{}");
    }
    /* Top intensity band uses sourceCap 8, but avatarCap 6 also bounds it. */
    expect(dispatchSpy).toHaveBeenCalledTimes(6);
    dispatchSpy.mockRestore();
  });

  it("tightens cadence when notification mode is disabled", () => {
    localStorage.setItem("axtask.notification.enabled", "false");
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    requestFeedbackNudge("task_complete");
    requestFeedbackNudge("task_search_success");
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    dispatchSpy.mockRestore();
  });

  it("applies weighted day budget so high-signal sources stop earlier", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    for (let i = 0; i < 12; i++) {
      const src = i % 2 === 0 ? "task_complete" : "classification_confirm";
      requestFeedbackNudge(src);
      localStorage.setItem("axtask.feedbackNudge.lastAt", "0");
      localStorage.setItem("axtask.feedbackNudge.avatarLastAt", "{}");
    }
    // Session cap (10) stops the loop before day budget on long runs.
    expect(dispatchSpy).toHaveBeenCalledTimes(10);
    dispatchSpy.mockRestore();
  });
});

describe("per-avatar feedback math", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("axtask.notification.enabled", "true");
  });

  it("composeEffectiveIntensity returns master when avatar slider is unset", () => {
    expect(computeEffectiveIntensity({ master: 80, byAvatar: {} }, "productivity")).toBe(80);
  });

  it("composeEffectiveIntensity multiplies master by per-avatar %", () => {
    expect(
      computeEffectiveIntensity({ master: 80, byAvatar: { productivity: 25 } }, "productivity"),
    ).toBe(20);
  });

  it("silences a single avatar family at 0 without muting others", () => {
    writeFeedbackPrefsCache({ master: 100, byAvatar: { productivity: 0 } });
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    requestFeedbackNudge("task_create"); // productivity — silenced
    expect(dispatchSpy).not.toHaveBeenCalled();
    localStorage.setItem("axtask.feedbackNudge.lastAt", "0");
    requestFeedbackNudge("classification_confirm"); // archetype — active
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const call = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect((call as CustomEvent<{ avatarKey: string }>).detail.avatarKey).toBe("archetype");
    dispatchSpy.mockRestore();
  });

  it("policy at zero intensity blocks every nudge", () => {
    const p = getFeedbackNudgePolicy(0, true);
    expect(p.sourceCap).toBe(0);
    expect(p.avatarCap).toBe(0);
    expect(p.cooldownMs).toBe(Number.POSITIVE_INFINITY);
  });

  it("enforces per-avatar cooldown even across different sources", () => {
    writeFeedbackPrefsCache({ master: 100, byAvatar: {} });
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    /* Both map to productivity per the source map. */
    requestFeedbackNudge("task_create");
    localStorage.setItem("axtask.feedbackNudge.lastAt", "0");
    requestFeedbackNudge("task_complete");
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    dispatchSpy.mockRestore();
  });
});

describe("hybrid feedback prefs cache", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips through the cache key", () => {
    writeFeedbackPrefsCache({ master: 73, byAvatar: { mood: 40 } });
    const raw = localStorage.getItem(FEEDBACK_PREFS_CACHE_KEY);
    expect(raw).toBeTruthy();
    const prefs = readFeedbackPrefsCache();
    expect(prefs.master).toBe(73);
    expect(prefs.byAvatar.mood).toBe(40);
  });

  it("falls back to default (master 50) when cache is empty", () => {
    const prefs = readFeedbackPrefsCache();
    expect(prefs.master).toBe(50);
    expect(prefs.byAvatar).toEqual({});
  });

  it("clamps out-of-range values on write and read", () => {
    writeFeedbackPrefsCache({ master: 200, byAvatar: { productivity: -50, lazy: 120 } });
    const prefs = readFeedbackPrefsCache();
    expect(prefs.master).toBe(100);
    expect(prefs.byAvatar.productivity).toBe(0);
    expect(prefs.byAvatar.lazy).toBe(100);
  });

  it("ignores malformed cached json", () => {
    localStorage.setItem(FEEDBACK_PREFS_CACHE_KEY, "{not-json");
    const prefs = readFeedbackPrefsCache();
    expect(prefs.master).toBe(50);
    expect(prefs.byAvatar).toEqual({});
  });
});
