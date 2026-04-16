import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  markInstallDismissed,
  readInstallDeviceState,
  shouldSuppressInstallPrompt,
  writeInstallDeviceState,
} from "./install-device-state";

describe("install device state", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it("suppresses prompts after dismiss with TTL", () => {
    markInstallDismissed();
    expect(shouldSuppressInstallPrompt()).toBe(true);
  });

  it("suppresses prompts when installed flag is set", () => {
    writeInstallDeviceState({ installed: true });
    expect(shouldSuppressInstallPrompt()).toBe(true);
    expect(readInstallDeviceState().installed).toBe(true);
  });
});

