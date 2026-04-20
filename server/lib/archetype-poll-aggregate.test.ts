// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyKAnonymityToPollTallies, type RawOptionTally } from "./archetype-poll-aggregate";

describe("applyKAnonymityToPollTallies", () => {
  it("suppresses cells below k", () => {
    const raw: RawOptionTally[] = [
      {
        optionId: "o1",
        label: "A",
        sortOrder: 0,
        totalCount: 7,
        countsByArchetype: new Map([
          ["momentum", 4],
          ["strategy", 3],
        ]),
      },
    ];
    const out = applyKAnonymityToPollTallies(raw, 5);
    expect(out[0].totalCount).toBe(7);
    expect(out[0].byArchetype.momentum).toBeUndefined();
    expect(out[0].byArchetype.strategy).toBeUndefined();
  });

  it("keeps cells at or above k", () => {
    const raw: RawOptionTally[] = [
      {
        optionId: "o1",
        label: "A",
        sortOrder: 0,
        totalCount: 10,
        countsByArchetype: new Map([["momentum", 10]]),
      },
    ];
    const out = applyKAnonymityToPollTallies(raw, 5);
    expect(out[0].byArchetype.momentum).toBe(10);
  });
});
