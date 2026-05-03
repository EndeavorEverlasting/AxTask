/**
 * Single source of truth for browser session cookie duration (and related CSRF cookie TTL).
 * See docs/SESSION_THREAT_MODEL.md and docs/ENVIRONMENT_VARIABLES.md (`SESSION_MAX_AGE_MS`).
 */

const DEFAULT_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MIN_SESSION_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SESSION_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000; // ~400 days

function resolveSessionMaxAgeMs(): number {
  const raw = (process.env.SESSION_MAX_AGE_MS || "").trim();
  if (!raw) {
    return DEFAULT_SESSION_MAX_AGE_MS;
  }

  const n = Number.parseInt(raw, 10);
  const isProd = process.env.NODE_ENV === "production";
  if (!Number.isFinite(n) || n < MIN_SESSION_MAX_AGE_MS || n > MAX_SESSION_MAX_AGE_MS) {
    const msg =
      `[auth] SESSION_MAX_AGE_MS must be an integer between ${MIN_SESSION_MAX_AGE_MS} and ${MAX_SESSION_MAX_AGE_MS} ms (got "${raw}").`;
    if (isProd) {
      console.error(`[FATAL] ${msg}`);
      process.exit(1);
    }
    console.warn(`${msg} Using default ${DEFAULT_SESSION_MAX_AGE_MS} ms.`);
    return DEFAULT_SESSION_MAX_AGE_MS;
  }

  return n;
}

/** Session / CSRF cookie max-age in milliseconds (reads `SESSION_MAX_AGE_MS` each call; env is static at runtime). */
export function getSessionMaxAgeMs(): number {
  return resolveSessionMaxAgeMs();
}

/** connect-pg-simple `ttl` is in seconds. */
export function getSessionStoreTtlSeconds(): number {
  return Math.max(1, Math.floor(getSessionMaxAgeMs() / 1000));
}
