import { describe, it, expect } from "vitest";
import {
  aggregateArchetypeSignalRows,
  sanitizeSignalsJsonForApi,
} from "./archetype-rollup-aggregate";

const row = (over: Record<string, unknown>) => ({
  v: 1,
  schemaVersion: 1,
  archetypeKey: "momentum",
  hashedActor: "hash-A",
  signal: "nudge_shown",
  insightful: null,
  sentiment: null,
  sourceCategory: "skill_unlock",
  ...over,
});

describe("aggregateArchetypeSignalRows", () => {
  it("produces aggregates for valid rows and reports skip counters separately", () => {
    const payloads: unknown[] = [
      row({ signal: "nudge_shown" }),
      row({ signal: "nudge_opened" }),
      row({ signal: "feedback_submitted", sentiment: "positive" }),
      "{ not json",                                // malformed
      null,                                         // malformed
      row({ archetypeKey: "mystery" }),            // unknown archetype -> malformed
      row({ signal: "unknown_kind" }),             // unknown kind -> malformed
      row({ v: 2, foo: "bar" }),                   // future-version, still shape-compatible
    ];

    const res = aggregateArchetypeSignalRows(payloads);

    expect(res.totalSignals).toBe(4);
    expect(res.skippedMalformed).toBe(4);
    expect(res.skippedFutureVersion).toBe(1);

    const momentum = res.perArchetype.get("momentum");
    expect(momentum).toBeDefined();
    expect(momentum!.shown).toBe(2); // one v1 + one v2
    expect(momentum!.opened).toBe(1);
    expect(momentum!.submitted).toBe(1);
    expect(momentum!.sentimentPositive).toBe(1);
  });

  it("initializes a bucket for every known archetype, even if unused", () => {
    const res = aggregateArchetypeSignalRows([]);
    for (const key of ["momentum", "strategy", "execution", "collaboration", "recovery"]) {
      expect(res.perArchetype.get(key)).toBeDefined();
    }
    expect(res.totalSignals).toBe(0);
    expect(res.skippedMalformed).toBe(0);
  });

  it("groups Markov sequences per hashedActor in event order", () => {
    const payloads: unknown[] = [
      row({ archetypeKey: "momentum", signal: "nudge_shown", hashedActor: "X" }),
      row({ archetypeKey: "strategy", signal: "nudge_opened", hashedActor: "X" }),
      row({ archetypeKey: "execution", signal: "feedback_submitted", hashedActor: "X" }),
      row({ archetypeKey: "recovery", signal: "nudge_shown", hashedActor: "Y" }),
    ];
    const res = aggregateArchetypeSignalRows(payloads);
    expect(res.perActorSeq.get("X")).toEqual(["momentum", "strategy", "execution"]);
    expect(res.perActorSeq.get("Y")).toEqual(["recovery"]);
  });

  it("tolerates string-form payloads (as they come from payload_json)", () => {
    const payloads: unknown[] = [
      JSON.stringify(row({ signal: "nudge_opened" })),
      JSON.stringify(row({ signal: "feedback_submitted", sentiment: "negative" })),
    ];
    const res = aggregateArchetypeSignalRows(payloads);
    expect(res.totalSignals).toBe(2);
    expect(res.perArchetype.get("momentum")!.opened).toBe(1);
    expect(res.perArchetype.get("momentum")!.sentimentNegative).toBe(1);
  });

  it("accepts legacy payloads with no v / schemaVersion as v0, still aggregated", () => {
    const legacy = { ...row({}), v: undefined, schemaVersion: undefined };
    const res = aggregateArchetypeSignalRows([legacy]);
    expect(res.totalSignals).toBe(1);
    expect(res.skippedFutureVersion).toBe(0);
  });

  it("continues a long batch past malformed rows without throwing", () => {
    const payloads: unknown[] = [];
    for (let i = 0; i < 50; i++) {
      payloads.push(row({ hashedActor: `actor-${i % 5}` }));
      if (i % 7 === 0) payloads.push("garbage");
      if (i % 11 === 0) payloads.push(undefined);
    }
    expect(() => aggregateArchetypeSignalRows(payloads)).not.toThrow();
    const res = aggregateArchetypeSignalRows(payloads);
    expect(res.totalSignals).toBe(50);
    expect(res.skippedMalformed).toBeGreaterThan(0);
  });
});

describe("sanitizeSignalsJsonForApi", () => {
  const fullCounts = {
    shown: 3,
    opened: 2,
    dismissed: 0,
    submitted: 1,
    insightfulUp: 1,
    insightfulDown: 0,
    sentimentPositive: 1,
    sentimentNeutral: 0,
    sentimentNegative: 0,
  };

  it("whitelists all known count fields and preserves subScores", () => {
    const input = {
      counts: fullCounts,
      subScores: { openRate: 0.66, conversionRate: 0.5 },
    };
    const res = sanitizeSignalsJsonForApi(input);
    expect(res).not.toBeNull();
    expect(res!.counts.shown).toBe(3);
    expect(res!.subScores.openRate).toBe(0.66);
  });

  it("tolerates a legacy row with counts but no subScores", () => {
    const res = sanitizeSignalsJsonForApi({ counts: fullCounts });
    expect(res).not.toBeNull();
    expect(res!.subScores).toEqual({});
  });

  it("tolerates a row missing counts entirely (returns zeros)", () => {
    const res = sanitizeSignalsJsonForApi({ subScores: { openRate: 0.1 } });
    expect(res).not.toBeNull();
    expect(res!.counts.shown).toBe(0);
    expect(res!.counts.opened).toBe(0);
    expect(res!.subScores.openRate).toBe(0.1);
  });

  it("drops unknown keys in counts and non-numeric subScores", () => {
    const res = sanitizeSignalsJsonForApi({
      counts: { ...fullCounts, mysteryKey: 9999 },
      subScores: { openRate: 0.5, mystery: "hello", bad: Number.NaN },
    });
    expect(res).not.toBeNull();
    expect((res!.counts as Record<string, number>).mysteryKey).toBeUndefined();
    expect(res!.subScores.openRate).toBe(0.5);
    expect(res!.subScores.mystery).toBeUndefined();
    expect(res!.subScores.bad).toBeUndefined();
  });

  it("returns null for non-object inputs", () => {
    expect(sanitizeSignalsJsonForApi(null)).toBeNull();
    expect(sanitizeSignalsJsonForApi(undefined)).toBeNull();
    expect(sanitizeSignalsJsonForApi("string")).toBeNull();
    expect(sanitizeSignalsJsonForApi([])).toBeNull();
    expect(sanitizeSignalsJsonForApi(42)).toBeNull();
  });

  it("coerces non-finite / non-numeric count values to 0", () => {
    const res = sanitizeSignalsJsonForApi({
      counts: {
        shown: Number.NaN,
        opened: Number.POSITIVE_INFINITY,
        dismissed: "3",
        submitted: null,
        insightfulUp: 1,
        insightfulDown: 0,
        sentimentPositive: 0,
        sentimentNeutral: 0,
        sentimentNegative: 0,
      },
    });
    expect(res).not.toBeNull();
    expect(res!.counts.shown).toBe(0);
    expect(res!.counts.opened).toBe(0);
    expect(res!.counts.dismissed).toBe(0);
    expect(res!.counts.submitted).toBe(0);
    expect(res!.counts.insightfulUp).toBe(1);
  });
});
