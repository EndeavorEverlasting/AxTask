// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

describe("voice preferences route contracts", () => {
  it("exposes GET and PATCH for cross-device voice listening mode", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain('app.get("/api/voice/preferences"');
    expect(routes).toContain('app.patch("/api/voice/preferences"');
    expect(routes).toContain("getUserVoicePreference");
    expect(routes).toContain("upsertUserVoicePreference");
    expect(routes).toContain("updateVoicePreferenceSchema");
  });

  it("registers user_voice_preferences migration", () => {
    const sql = fs.readFileSync(path.join(root, "migrations", "0013_user_voice_preferences.sql"), "utf8");
    expect(sql).toContain("user_voice_preferences");
    expect(sql).toContain("listening_mode");
  });
});
