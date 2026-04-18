import { describe, expect, it } from "vitest";
import { getSafePostLoginPath } from "./post-login-redirect";

describe("getSafePostLoginPath", () => {
  it("allows known app paths", () => {
    expect(getSafePostLoginPath("/premium")).toBe("/premium");
    expect(getSafePostLoginPath(encodeURIComponent("/tasks"))).toBe("/tasks");
  });

  it("rejects external and traversal", () => {
    expect(getSafePostLoginPath("https://evil.com")).toBeNull();
    expect(getSafePostLoginPath("//evil.com")).toBeNull();
    expect(getSafePostLoginPath("/../admin")).toBeNull();
    expect(getSafePostLoginPath("/not-a-route")).toBeNull();
  });

  it("returns null for empty", () => {
    expect(getSafePostLoginPath(null)).toBeNull();
    expect(getSafePostLoginPath("")).toBeNull();
  });
});
