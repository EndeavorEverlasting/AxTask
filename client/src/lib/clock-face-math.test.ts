import { describe, expect, it } from "vitest";
import { polarToClockHour12, polarToClockMinute } from "./clock-face-math";

describe("clock-face-math", () => {
  it("maps top center to minute 0", () => {
    expect(polarToClockMinute(0, -50)).toBe(0);
  });

  it("maps right to minute 15", () => {
    expect(polarToClockMinute(50, 0)).toBe(15);
  });

  it("maps bottom to minute 30", () => {
    expect(polarToClockMinute(0, 50)).toBe(30);
  });

  it("maps left to minute 45", () => {
    expect(polarToClockMinute(-50, 0)).toBe(45);
  });

  it("maps hour dial top to 12", () => {
    expect(polarToClockHour12(0, -50)).toBe(12);
  });

  it("maps hour dial right to 3", () => {
    expect(polarToClockHour12(50, 0)).toBe(3);
  });
});
