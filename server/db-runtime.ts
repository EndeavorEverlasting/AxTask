export const DEFAULT_DB_CONNECTION_TIMEOUT_MS = 5_000;
const MIN_DB_CONNECTION_TIMEOUT_MS = 1_000;
const MAX_DB_CONNECTION_TIMEOUT_MS = 30_000;

/**
 * Keep node-postgres connection acquisition bounded during transient provider
 * or network failures. Operator tuning is intentionally clamped so a typo
 * cannot restore the implicit no-timeout behavior or create an extreme stall.
 */
export function resolveDbConnectionTimeoutMs(raw: string | undefined): number {
  if (!raw?.trim()) return DEFAULT_DB_CONNECTION_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_DB_CONNECTION_TIMEOUT_MS;
  return Math.max(
    MIN_DB_CONNECTION_TIMEOUT_MS,
    Math.min(MAX_DB_CONNECTION_TIMEOUT_MS, Math.round(parsed)),
  );
}
