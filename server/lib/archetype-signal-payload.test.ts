import { describe, it, expect } from "vitest";
import {
  ARCHETYPE_SIGNAL_PAYLOAD_VERSION,
  parseArchetypeSignalPayload,
  isFutureBreakingVersion,
} from "./archetype-signal-payload";

const baseV1 = {
  v: 1,
  schemaVersion: 1,
  archetypeKey: "momentum",
  hashedActor: "abc-hashed",
  signal: "nudge_shown",
  insightful: null,
  sentiment: null,
  sourceCategory: "skill_unlock",
};

describe("parseArchetypeSignalPayload", () => {
  it("accepts a fully-formed v1 payload", () => {
    const res = parseArchetypeSignalPayload(baseV1);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.version).toBe(1);
      expect(res.payload.archetypeKey).toBe("momentum");
      expect(res.payload.signal).toBe("nudge_shown");
      expect(res.payload.hashedActor).toBe("abc-hashed");
    }
  });

  it("accepts legacy payloads with no v / schemaVersion", () => {
    const legacy = { ...baseV1 };
    delete (legacy as Record<string, unknown>).v;
    delete (legacy as Record<string, unknown>).schemaVersion;
    const res = parseArchetypeSignalPayload(legacy);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.version).toBe(0);
  });

  it("accepts forward payloads with unknown fields and a future v", () => {
    const future = {
      ...baseV1,
      v: 2,
      schemaVersion: 2,
      foo: "bar",
      nested: { unknown: true },
    };
    const res = parseArchetypeSignalPayload(future);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.version).toBe(2);
      expect(isFutureBreakingVersion(res.version)).toBe(true);
    }
  });

  it("accepts JSON strings (as stored in security_events.payload_json)", () => {
    const raw = JSON.stringify(baseV1);
    const res = parseArchetypeSignalPayload(raw);
    expect(res.ok).toBe(true);
  });

  it("rejects non-object inputs", () => {
    expect(parseArchetypeSignalPayload(null).ok).toBe(false);
    expect(parseArchetypeSignalPayload(undefined).ok).toBe(false);
    expect(parseArchetypeSignalPayload(42).ok).toBe(false);
    expect(parseArchetypeSignalPayload([]).ok).toBe(false);
    expect(parseArchetypeSignalPayload("").ok).toBe(false);
  });

  it("rejects invalid JSON strings with a distinct reason", () => {
    const res = parseArchetypeSignalPayload("{ not json");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("invalid_json");
  });

  it("rejects unknown archetype keys", () => {
    const res = parseArchetypeSignalPayload({ ...baseV1, archetypeKey: "nope" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("unknown_archetype");
  });

  it("rejects unknown signal kinds", () => {
    const res = parseArchetypeSignalPayload({ ...baseV1, signal: "mystery" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("unknown_kind");
  });

  it("rejects payloads missing archetypeKey entirely", () => {
    const { archetypeKey: _omit, ...withoutKey } = baseV1;
    void _omit;
    const res = parseArchetypeSignalPayload(withoutKey);
    expect(res.ok).toBe(false);
  });

  it("accepts insightful: null and avatarKey-absent payloads", () => {
    const res = parseArchetypeSignalPayload({ ...baseV1, insightful: null, sentiment: null });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.payload.insightful).toBe(null);
      expect(res.payload.sentiment).toBe(null);
    }
  });

  it("accepts all five archetype keys and all four signal kinds", () => {
    for (const ak of ["momentum", "strategy", "execution", "collaboration", "recovery"]) {
      for (const sig of [
        "nudge_shown",
        "nudge_dismissed",
        "nudge_opened",
        "feedback_submitted",
      ]) {
        const res = parseArchetypeSignalPayload({ ...baseV1, archetypeKey: ak, signal: sig });
        expect(res.ok, `${ak}/${sig}`).toBe(true);
      }
    }
  });

  it("round-trips via JSON.stringify -> parse", () => {
    const stamped = { ...baseV1 };
    const roundtripped = JSON.parse(JSON.stringify(stamped));
    const res = parseArchetypeSignalPayload(roundtripped);
    expect(res.ok).toBe(true);
  });

  it("treats the exported current version constant as 1", () => {
    expect(ARCHETYPE_SIGNAL_PAYLOAD_VERSION).toBe(1);
  });

  it("isFutureBreakingVersion: strict > current only", () => {
    expect(isFutureBreakingVersion(0)).toBe(false);
    expect(isFutureBreakingVersion(1)).toBe(false);
    expect(isFutureBreakingVersion(2)).toBe(true);
    expect(isFutureBreakingVersion(Number.POSITIVE_INFINITY)).toBe(true);
    expect(isFutureBreakingVersion(Number.NaN)).toBe(false);
  });
});
