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

  it("applies weighted day budget so high-signal sources stop earlier", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    for (let i = 0; i < 12; i++) {
      requestFeedbackNudge(i % 2 === 0 ? "task_complete" : "classification_confirm");
      localStorage.setItem("axtask.feedbackNudge.lastAt", "0");
    }
    // High-intensity mode allows a large budget, but weighted events still cap.
    expect(dispatchSpy).toHaveBeenCalledTimes(9);
    dispatchSpy.mockRestore();
  });
});
