import { describe, expect, it, beforeEach, vi } from "vitest";
import { requestFeedbackNudge } from "./feedback-nudge";

describe("feedback nudge guardrails", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
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
    requestFeedbackNudge("task_complete");
    localStorage.setItem("axtask.feedbackNudge.lastAt", "0");
    requestFeedbackNudge("task_complete");
    localStorage.setItem("axtask.feedbackNudge.lastAt", "0");
    requestFeedbackNudge("task_complete");
    localStorage.setItem("axtask.feedbackNudge.lastAt", "0");
    requestFeedbackNudge("task_complete");
    expect(dispatchSpy).toHaveBeenCalledTimes(3);
    dispatchSpy.mockRestore();
  });
});

