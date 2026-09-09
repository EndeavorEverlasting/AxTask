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

/**
 * node-postgres parses connectionString after object options, so a URL-level
 * application_name would otherwise override the explicit AxTask attribution.
 * Remove only that query parameter and preserve the rest of the URL verbatim
 * apart from standard URLSearchParams query serialization.
 */
export function stripDatabaseUrlApplicationName(connectionString: string): string {
  const queryIndex = connectionString.indexOf("?");
  if (queryIndex < 0) return connectionString;

  const prefix = connectionString.slice(0, queryIndex);
  const queryAndFragment = connectionString.slice(queryIndex + 1);
  const fragmentIndex = queryAndFragment.indexOf("#");
  const query = fragmentIndex < 0
    ? queryAndFragment
    : queryAndFragment.slice(0, fragmentIndex);
  const fragment = fragmentIndex < 0
    ? ""
    : queryAndFragment.slice(fragmentIndex);

  const params = new URLSearchParams(query);
  params.delete("application_name");
  const serialized = params.toString();
  return `${prefix}${serialized ? `?${serialized}` : ""}${fragment}`;
}
