import { describe, expect, it } from "vitest";

/**
 * Mirrors the userInitials logic from sidebar.tsx (not exported, so replicated here for coverage).
 * If the implementation diverges, keep this test in sync.
 */
function userInitials(u: { displayName?: string | null; email?: string | null }): string {
  const base = (u.displayName || u.email || "").trim();
  return base
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0] || "")
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

describe("userInitials", () => {
  it("produces two-letter initials from display name", () => {
    expect(userInitials({ displayName: "Jane Doe" })).toBe("JD");
  });

  it("falls back to email", () => {
    expect(userInitials({ email: "jane@example.com" })).toBe("J");
  });

  it("returns empty string for empty/whitespace-only input", () => {
    expect(userInitials({ displayName: "   " })).toBe("");
    expect(userInitials({})).toBe("");
  });

  it("does not produce 'undefined' for empty segments", () => {
    const result = userInitials({ displayName: "" });
    expect(result).not.toContain("undefined");
    expect(result).toBe("");
  });

  it("handles single name", () => {
    expect(userInitials({ displayName: "Jane" })).toBe("J");
  });

  it("truncates to 2 initials max", () => {
    expect(userInitials({ displayName: "A B C D" })).toBe("AB");
  });

  it("handles leading/trailing spaces", () => {
    expect(userInitials({ displayName: "  John Smith  " })).toBe("JS");
  });
});
