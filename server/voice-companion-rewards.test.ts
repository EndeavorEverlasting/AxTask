// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { EngineResponse } from "./engines/dispatcher";
import {
  voiceDispatchQualifiesForCompanionRewards,
  applyVoiceCompanionRewards,
} from "./voice-companion-rewards";

vi.mock("./engagement-rewards", () => ({
  ENGAGEMENT: {
    voiceCommandCompanion: {
      reason: "voice_command_companion_reward",
      amount: 1,
      dailyCap: 24,
    },
  },
  tryCappedCoinAward: vi.fn(),
  countCoinEventsToday: vi.fn(),
}));

vi.mock("./storage", () => ({
  getAvatarProfiles: vi.fn(),
  selectDominantAvatarProfile: vi.fn(),
  applyVoiceAvatarXpWithTick: vi.fn(),
}));

describe("voiceDispatchQualifiesForCompanionRewards", () => {
  it("rejects navigation", () => {
    const r: EngineResponse = {
      intent: "navigation",
      action: "navigate",
      payload: { path: "/tasks" },
      message: "ok",
    };
    expect(voiceDispatchQualifiesForCompanionRewards(r)).toBe(false);
  });

  it("accepts task_create", () => {
    const r: EngineResponse = {
      intent: "task_create",
      action: "prefill_task",
      payload: { activity: "x" },
      message: "ok",
    };
    expect(voiceDispatchQualifiesForCompanionRewards(r)).toBe(true);
  });

  it("rejects calendar open-only navigate to /calendar", () => {
    const r: EngineResponse = {
      intent: "calendar_command",
      action: "navigate",
      payload: { path: "/calendar" },
      message: "ok",
    };
    expect(voiceDispatchQualifiesForCompanionRewards(r)).toBe(false);
  });

  it("accepts calendar reschedule_task", () => {
    const r: EngineResponse = {
      intent: "calendar_command",
      action: "reschedule_task",
      payload: { taskId: "t" },
      message: "ok",
    };
    expect(voiceDispatchQualifiesForCompanionRewards(r)).toBe(true);
  });

  it("rejects task_review with no actions", () => {
    const r: EngineResponse = {
      intent: "task_review",
      action: "show_review",
      payload: { actions: [], unmatched: [] },
      message: "ok",
    };
    expect(voiceDispatchQualifiesForCompanionRewards(r)).toBe(false);
  });

  it("accepts task_review with actions", () => {
    const r: EngineResponse = {
      intent: "task_review",
      action: "show_review",
      payload: { actions: [{ type: "complete", taskId: "1", taskActivity: "a", details: {}, confidence: 1, reason: "r" }], unmatched: [] },
      message: "ok",
    };
    expect(voiceDispatchQualifiesForCompanionRewards(r)).toBe(true);
  });

  it("rejects empty search query", () => {
    const r: EngineResponse = {
      intent: "search",
      action: "show_results",
      payload: { query: "   ", results: [] },
      message: "ok",
    };
    expect(voiceDispatchQualifiesForCompanionRewards(r)).toBe(false);
  });

  it("accepts alarm_create_for_task only for alarm_config", () => {
    expect(
      voiceDispatchQualifiesForCompanionRewards({
        intent: "alarm_config",
        action: "alarm_open_panel",
        payload: {},
        message: "ok",
      }),
    ).toBe(false);
    expect(
      voiceDispatchQualifiesForCompanionRewards({
        intent: "alarm_config",
        action: "alarm_create_for_task",
        payload: { taskId: "x" },
        message: "ok",
      }),
    ).toBe(true);
  });
});

describe("applyVoiceCompanionRewards", () => {
  it("returns null when not qualified", async () => {
    const { tryCappedCoinAward } = await import("./engagement-rewards");
    const out = await applyVoiceCompanionRewards("u1", {
      intent: "navigation",
      action: "navigate",
      payload: { path: "/" },
      message: "x",
    });
    expect(out).toBeNull();
    expect(tryCappedCoinAward).not.toHaveBeenCalled();
  });
});
