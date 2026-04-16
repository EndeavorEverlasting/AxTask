import { describe, expect, it, beforeEach, vi } from "vitest";
import { requestFeedbackNudge } from "./feedback-nudge";

describe("feedback nudge guardrails", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("axtask.notification.enabled", "true");
    localStorage.setItem("axtask.notification.intensity", "100");
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
    }
    expect(dispatchSpy).toHaveBeenCalledTimes(5);
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
});

