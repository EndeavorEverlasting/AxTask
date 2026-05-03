import { describe, expect, it } from "vitest";
import { updateVoicePreferenceSchema, voiceListeningModeSchema } from "./schema";

describe("voice preference schemas", () => {
  it("accepts valid listening modes", () => {
    expect(voiceListeningModeSchema.parse("manual")).toBe("manual");
    expect(voiceListeningModeSchema.parse("wake_after_first_use")).toBe("wake_after_first_use");
    expect(updateVoicePreferenceSchema.parse({ listeningMode: "manual" })).toEqual({
      listeningMode: "manual",
    });
  });

  it("rejects invalid listening mode", () => {
    expect(() => voiceListeningModeSchema.parse("always_on")).toThrow();
    expect(() => updateVoicePreferenceSchema.parse({ listeningMode: "nope" })).toThrow();
  });
});
