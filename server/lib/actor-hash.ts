import { createHash, createHmac } from "crypto";

/**
 * Deterministic, non-reversible hash of a userId for archetype-level analytics.
 *
 * Every archetype-signal event row stores `hashedActor = HMAC-SHA256(userId)`
 * instead of `userId`, so per-user analysis is structurally impossible while
 * still allowing Markov sequence reconstruction per-hash.
 *
 * Key behavior:
 * - Production requires `ARCHETYPE_ANALYTICS_SALT` (fail-closed).
 * - Non-production derives a deterministic key from `SESSION_SECRET` so dev
 *   boxes keep working but produce the same hashes across restarts.
 *
 * See docs/ARCHETYPE_EMPATHY_ANALYTICS.md for the privacy model.
 */

const DEV_FALLBACK_SENTINEL = "dev-insecure-session";

function getAnalyticsSalt(): Buffer {
  const explicit = process.env.ARCHETYPE_ANALYTICS_SALT?.trim();
  if (explicit && explicit.length >= 16) {
    return createHash("sha256").update(`${explicit}:axtask_archetype_v1`).digest();
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ARCHETYPE_ANALYTICS_SALT is required in production (>=16 chars) for archetype analytics",
    );
  }
  const sess = process.env.SESSION_SECRET || DEV_FALLBACK_SENTINEL;
  return createHash("sha256").update(`${sess}:axtask_archetype_v1`).digest();
}

export function hashActor(userId: string): string {
  if (!userId) {
    throw new Error("hashActor requires a non-empty userId");
  }
  const salt = getAnalyticsSalt();
  return createHmac("sha256", salt).update(userId).digest("base64url");
}

/** Exposed for tests only. Do not import from production code paths. */
export const __test_only__ = {
  DEV_FALLBACK_SENTINEL,
};
