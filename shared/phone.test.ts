import { describe, expect, it } from "vitest";
import { maskE164ForDisplay, normalizeToE164 } from "./phone";

describe("normalizeToE164", () => {
  it("normalizes 10-digit US input", () => {
    expect(normalizeToE164("5551234567")).toBe("+15551234567");
    expect(normalizeToE164("(555) 123-4567")).toBe("+15551234567");
  });

  it("accepts +1 prefix", () => {
    expect(normalizeToE164("+1 555 123 4567")).toBe("+15551234567");
  });

  it("rejects too short", () => {
    expect(normalizeToE164("12345")).toBeNull();
  });
});

describe("maskE164ForDisplay", () => {
  it("masks US-style numbers", () => {
    expect(maskE164ForDisplay("+15551234567")).toBe("(***) ***-**67");
  });

  it("handles null", () => {
    expect(maskE164ForDisplay(null)).toBeNull();
  });
});
