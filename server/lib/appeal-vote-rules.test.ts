import { describe, expect, it } from "vitest";
import { computeAppealVoteThreshold, evaluateAppealOutcome } from "./appeal-vote-rules";

describe("computeAppealVoteThreshold", () => {
  it("requires one vote each way for a single admin", () => {
    const t = computeAppealVoteThreshold(1);
    expect(t.grantNeeded).toBe(1);
    expect(t.denyNeeded).toBe(1);
  });

  it("requires both admins to agree when there are two", () => {
    const t = computeAppealVoteThreshold(2);
    expect(t.grantNeeded).toBe(2);
    expect(t.denyNeeded).toBe(2);
  });

  it("uses two-thirds ceiling for three admins", () => {
    const t = computeAppealVoteThreshold(3);
    expect(t.grantNeeded).toBe(2);
    expect(t.denyNeeded).toBe(2);
  });

  it("uses two-thirds ceiling for four admins", () => {
    const t = computeAppealVoteThreshold(4);
    expect(t.grantNeeded).toBe(3);
    expect(t.denyNeeded).toBe(3);
  });

  it("uses two-thirds ceiling for five admins", () => {
    const t = computeAppealVoteThreshold(5);
    expect(t.grantNeeded).toBe(4);
    expect(t.denyNeeded).toBe(4);
  });

  it("uses two-thirds ceiling for six admins", () => {
    const t = computeAppealVoteThreshold(6);
    expect(t.grantNeeded).toBe(4);
    expect(t.denyNeeded).toBe(4);
  });
});

describe("evaluateAppealOutcome", () => {
  it("resolves on grant threshold", () => {
    expect(evaluateAppealOutcome(3, 2, 0)).toBe("grant");
    expect(evaluateAppealOutcome(3, 1, 0)).toBe("pending");
  });

  it("resolves on deny threshold", () => {
    expect(evaluateAppealOutcome(3, 0, 2)).toBe("deny");
  });

  it("two-admin stalemate until both agree", () => {
    expect(evaluateAppealOutcome(2, 1, 0)).toBe("pending");
    expect(evaluateAppealOutcome(2, 1, 1)).toBe("pending");
    expect(evaluateAppealOutcome(2, 2, 0)).toBe("grant");
    expect(evaluateAppealOutcome(2, 0, 2)).toBe("deny");
  });
});
