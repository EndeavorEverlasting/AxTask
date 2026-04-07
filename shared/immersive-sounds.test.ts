import { describe, expect, it } from "vitest";
import { shouldPlayImmersiveSound } from "./immersive-sounds";

describe("shouldPlayImmersiveSound", () => {
  it("never plays tier 3 at intensity 50 or below", () => {
    for (let i = 0; i <= 50; i++) {
      expect(shouldPlayImmersiveSound(i, 3, 0)).toBe(false);
      expect(shouldPlayImmersiveSound(i, 3, 0.99)).toBe(false);
    }
  });

  it("allows tier 3 only above 50 with low probability at the top", () => {
    expect(shouldPlayImmersiveSound(51, 3, 0.999)).toBe(false);
    expect(shouldPlayImmersiveSound(100, 3, 0.99)).toBe(false);
    expect(shouldPlayImmersiveSound(100, 3, 0.05)).toBe(true);
    expect(shouldPlayImmersiveSound(100, 3, 0.5)).toBe(false);
  });

  it("tier 1 has a floor at low intensity", () => {
    const plays = Array.from({ length: 200 }, (_, j) =>
      shouldPlayImmersiveSound(5, 1, j / 200),
    ).filter(Boolean).length;
    expect(plays).toBeGreaterThan(50);
  });

  it("returns false for non-positive intensity", () => {
    expect(shouldPlayImmersiveSound(0, 1, 0)).toBe(false);
    expect(shouldPlayImmersiveSound(-1, 2, 0)).toBe(false);
  });
});
