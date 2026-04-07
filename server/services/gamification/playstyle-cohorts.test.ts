// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assignPlaystyleCohort,
  meanPlaystyleSignals,
  type PlaystyleSignals,
} from "./playstyle-cohort-rules";

function baseSignals(over: Partial<PlaystyleSignals> = {}): PlaystyleSignals {
  return {
    events: 20,
    taskRatio: 0.33,
    socialRatio: 0.33,
    postRatio: 0.05,
    productivityShare: 0.2,
    archetypeShare: 0.2,
    moodShare: 0.2,
    socialAvatarShare: 0.2,
    classificationScore: 0.1,
    coinEvents: 4,
    maxAvatarConcentration: 0.35,
    ...over,
  };
}

describe("assignPlaystyleCohort", () => {
  it("returns latent_player for very low engagement", () => {
    expect(assignPlaystyleCohort(baseSignals({ events: 2 }))).toBe("latent_player");
  });

  it("detects social_weaver", () => {
    expect(
      assignPlaystyleCohort(
        baseSignals({ events: 30, socialRatio: 0.55, taskRatio: 0.2, maxAvatarConcentration: 0.4 }),
      ),
    ).toBe("social_weaver");
  });

  it("detects completionist_driver", () => {
    expect(
      assignPlaystyleCohort(
        baseSignals({
          events: 25,
          taskRatio: 0.6,
          productivityShare: 0.35,
          socialRatio: 0.15,
          maxAvatarConcentration: 0.4,
        }),
      ),
    ).toBe("completionist_driver");
  });

  it("detects optimizer_grinder from classification score", () => {
    expect(
      assignPlaystyleCohort(
        baseSignals({
          events: 20,
          classificationScore: 0.5,
          taskRatio: 0.3,
          socialRatio: 0.25,
        }),
      ),
    ).toBe("optimizer_grinder");
  });

  it("defaults to balanced_multiclass", () => {
    expect(assignPlaystyleCohort(baseSignals({ events: 15 }))).toBe("balanced_multiclass");
  });

  it("detects archetype_specialist from avatar concentration", () => {
    expect(
      assignPlaystyleCohort(
        baseSignals({
          events: 10,
          maxAvatarConcentration: 0.75,
          taskRatio: 0.35,
          socialRatio: 0.35,
          productivityShare: 0.1,
          classificationScore: 0.1,
        }),
      ),
    ).toBe("archetype_specialist");
  });
});

describe("meanPlaystyleSignals", () => {
  it("returns empty object for no rows", () => {
    expect(meanPlaystyleSignals([])).toEqual({});
  });

  it("returns the single row values", () => {
    const one: PlaystyleSignals = {
      events: 8,
      taskRatio: 0.5,
      socialRatio: 0.25,
      postRatio: 0.1,
      productivityShare: 0.2,
      archetypeShare: 0.2,
      moodShare: 0.2,
      socialAvatarShare: 0.15,
      classificationScore: 0.2,
      coinEvents: 3,
      maxAvatarConcentration: 0.4,
    };
    expect(meanPlaystyleSignals([one])).toEqual({
      events: 8,
      taskRatio: 0.5,
      socialRatio: 0.25,
      postRatio: 0.1,
      productivityShare: 0.2,
      archetypeShare: 0.2,
      moodShare: 0.2,
      socialAvatarShare: 0.15,
      classificationScore: 0.2,
      coinEvents: 3,
      maxAvatarConcentration: 0.4,
    });
  });

  it("averages and rounds to four decimal places", () => {
    const a: PlaystyleSignals = {
      events: 10,
      taskRatio: 0.2,
      socialRatio: 0.8,
      postRatio: 0,
      productivityShare: 0.1,
      archetypeShare: 0.1,
      moodShare: 0.1,
      socialAvatarShare: 0.1,
      classificationScore: 0.1,
      coinEvents: 2,
      maxAvatarConcentration: 0.5,
    };
    const b: PlaystyleSignals = {
      events: 20,
      taskRatio: 0.4,
      socialRatio: 0.6,
      postRatio: 0.1,
      productivityShare: 0.3,
      archetypeShare: 0.2,
      moodShare: 0.1,
      socialAvatarShare: 0.2,
      classificationScore: 0.3,
      coinEvents: 6,
      maxAvatarConcentration: 0.7,
    };
    expect(meanPlaystyleSignals([a, b])).toEqual({
      events: 15,
      taskRatio: 0.3,
      socialRatio: 0.7,
      postRatio: 0.05,
      productivityShare: 0.2,
      archetypeShare: 0.15,
      moodShare: 0.1,
      socialAvatarShare: 0.15,
      classificationScore: 0.2,
      coinEvents: 4,
      maxAvatarConcentration: 0.6,
    });
  });
});
