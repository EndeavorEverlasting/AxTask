// @vitest-environment node
import { describe, expect, it } from "vitest";
import { maskReporterEmailForPrivacy } from "./feedback-inbox-parser";

describe("maskReporterEmailForPrivacy", () => {
  it("masks a normal email address", () => {
    expect(maskReporterEmailForPrivacy("visitor@example.com")).toBe("vi•••@example.com");
  });

  it("handles single-character local part", () => {
    expect(maskReporterEmailForPrivacy("a@example.com")).toBe("•@example.com");
  });

  it("handles two-character local part", () => {
    expect(maskReporterEmailForPrivacy("ab@example.com")).toBe("a•@example.com");
  });

  it("returns [redacted] for missing domain", () => {
    expect(maskReporterEmailForPrivacy("noDomain")).toBe("[redacted]");
  });

  it("returns [redacted] for empty string", () => {
    expect(maskReporterEmailForPrivacy("")).toBe("[redacted]");
  });

  it("handles emails with multiple @ signs correctly (splits at last @)", () => {
    const result = maskReporterEmailForPrivacy("user@middle@domain.com");
    expect(result).toBe("us•••@domain.com");
    expect(result).not.toContain("middle");
  });

  it("trims whitespace", () => {
    expect(maskReporterEmailForPrivacy("  user@example.com  ")).toBe("us•••@example.com");
  });

  it("returns [redacted] when @ is at position 0", () => {
    expect(maskReporterEmailForPrivacy("@example.com")).toBe("[redacted]");
  });
});
