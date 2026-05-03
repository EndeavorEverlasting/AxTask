import { describe, expect, it } from "vitest";
import { detectInstallPlatform, getInstallInstructions } from "./install-shortcut";

describe("install-shortcut helpers", () => {
  it("detects iOS user agents", () => {
    const platform = detectInstallPlatform(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)",
    );
    expect(platform).toBe("ios");
  });

  it("detects Android user agents", () => {
    const platform = detectInstallPlatform(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8)",
    );
    expect(platform).toBe("android");
  });

  it("detects desktop user agents", () => {
    const platform = detectInstallPlatform(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    );
    expect(platform).toBe("desktop");
  });

  it("returns instruction steps for each platform", () => {
    expect(getInstallInstructions("ios").length).toBeGreaterThan(1);
    expect(getInstallInstructions("android").length).toBeGreaterThan(1);
    expect(getInstallInstructions("desktop").length).toBeGreaterThan(1);
    expect(getInstallInstructions("unknown").length).toBeGreaterThan(1);
  });
});
