// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..", "..", "..");

describe("native reminder bridge contracts", () => {
  it("defines Android and Windows bridge adapters", () => {
    const src = fs.readFileSync(
      path.join(root, "client", "src", "lib", "native-reminder-bridge.ts"),
      "utf8",
    );
    expect(src).toContain("AndroidReminderBridge");
    expect(src).toContain("WindowsReminderBridge");
    expect(src).toContain("applyReminderPolicy");
  });

  it("uses feature flags to gate native reminder bridge calls", () => {
    const src = fs.readFileSync(
      path.join(root, "client", "src", "lib", "native-reminder-bridge.ts"),
      "utf8",
    );
    expect(src).toContain("VITE_ENABLE_ANDROID_REMINDERS");
    expect(src).toContain("VITE_ENABLE_WINDOWS_REMINDERS");
  });
});

