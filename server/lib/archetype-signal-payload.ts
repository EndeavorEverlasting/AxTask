/**
 * Tolerant, version-aware parser for archetype_signal payloads.
 *
 * Every new archetype_signal event row written by `recordArchetypeSignal`
 * carries `v: 1` + `schemaVersion: 1`. Historical rows (pre-versioning) and
 * any future-version rows that remain shape-compatible must still be parsed
 * so the rollup worker keeps flowing across rolling deploys and schema
 * evolutions.
 *
 * Evolution rules for future versions (see docs/ARCHETYPE_EMPATHY_ANALYTICS.md):
 *  - New fields MUST be optional.
 *  - Fields MUST NOT be removed within the same major version.
 *  - Bump `v` only on a breaking change (field removed / semantics changed).
 *  - This parser accepts anything with a compatible shape regardless of `v`,
 *    so additive evolutions do not require a coordinated deploy.
 */

import { z } from "zod";
import { ARCHETYPE_KEYS } from "@shared/avatar-archetypes";

export const ARCHETYPE_SIGNAL_PAYLOAD_VERSION = 1 as const;

const ARCHETYPE_SIGNAL_KINDS = [
  "nudge_shown",
  "nudge_dismissed",
  "nudge_opened",
  "feedback_submitted",
] as const;

export type ParsedArchetypeSignalPayload = {
  v: number;
  archetypeKey: (typeof ARCHETYPE_KEYS)[number];
  hashedActor: string | null;
  signal: (typeof ARCHETYPE_SIGNAL_KINDS)[number];
  insightful: "up" | "down" | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  sourceCategory: string;
};

/**
 * Zod schema that validates only the fields the rollup worker consumes.
 * `.catchall(z.unknown())` keeps unknown future fields so v2+ payloads still
 * parse; `.optional().nullable()` on `v` / `schemaVersion` accepts legacy
 * pre-version rows.
 */
export const archetypeSignalPayloadSchema = z
  .object({
    v: z.number().int().nonnegative().optional().nullable(),
    schemaVersion: z.number().int().nonnegative().optional().nullable(),
    archetypeKey: z.enum(ARCHETYPE_KEYS as unknown as [string, ...string[]]),
    hashedActor: z.string().min(1).optional().nullable(),
    signal: z.enum(ARCHETYPE_SIGNAL_KINDS),
    insightful: z.enum(["up", "down"]).optional().nullable(),
    sentiment: z.enum(["positive", "neutral", "negative"]).optional().nullable(),
    sourceCategory: z.string().optional().nullable(),
  })
  .catchall(z.unknown());

export type ParseResult =
  | { ok: true; payload: ParsedArchetypeSignalPayload; version: number }
  | {
      ok: false;
      reason:
        | "not_object"
        | "invalid_json"
        | "schema_mismatch"
        | "unknown_archetype"
        | "unknown_kind";
    };

/**
 * Parse either a raw JSON string (the shape `security_events.payload_json`
 * comes in as from the DB) or an already-deserialized object. Returns a
 * discriminated result so callers can surface counters (malformed /
 * future-incompatible) without exceptions.
 */
export function parseArchetypeSignalPayload(raw: unknown): ParseResult {
  let candidate: unknown = raw;

  if (typeof raw === "string") {
    if (raw.trim() === "") {
      return { ok: false, reason: "not_object" };
    }
    try {
      candidate = JSON.parse(raw);
    } catch {
      return { ok: false, reason: "invalid_json" };
    }
  }

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { ok: false, reason: "not_object" };
  }

  const parsed = archetypeSignalPayloadSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join(".");
    if (path === "archetypeKey") return { ok: false, reason: "unknown_archetype" };
    if (path === "signal") return { ok: false, reason: "unknown_kind" };
    return { ok: false, reason: "schema_mismatch" };
  }

  const data = parsed.data;

  const versionFromV = typeof data.v === "number" ? data.v : null;
  const versionFromSchema = typeof data.schemaVersion === "number" ? data.schemaVersion : null;
  const resolvedVersion = versionFromV ?? versionFromSchema ?? 0;

  return {
    ok: true,
    version: resolvedVersion,
    payload: {
      v: resolvedVersion,
      archetypeKey: data.archetypeKey as (typeof ARCHETYPE_KEYS)[number],
      hashedActor: data.hashedActor ?? null,
      signal: data.signal,
      insightful: data.insightful ?? null,
      sentiment: data.sentiment ?? null,
      sourceCategory: typeof data.sourceCategory === "string" ? data.sourceCategory : "unknown",
    },
  };
}

/**
 * Convenience: true iff the payload version is newer than what we know how
 * to read. `NaN` is treated as "unknown but not future" (parser already
 * downgraded it to `0` when resolving the version), while `Infinity` is
 * treated as future so operators see the spike.
 */
export function isFutureBreakingVersion(version: number): boolean {
  if (Number.isNaN(version)) return false;
  return version > ARCHETYPE_SIGNAL_PAYLOAD_VERSION;
}
