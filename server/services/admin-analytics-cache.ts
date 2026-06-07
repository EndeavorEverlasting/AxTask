/** In-memory TTL cache for expensive admin analytics overview (60s default). */

type CacheEntry<T> = { value: T; expiresAt: number };

let overviewCache: CacheEntry<unknown> | null = null;

const DEFAULT_TTL_MS = 60_000;

export function getCachedAdminAnalyticsOverview<T>(): T | null {
  if (!overviewCache || Date.now() >= overviewCache.expiresAt) return null;
  return overviewCache.value as T;
}

export function setCachedAdminAnalyticsOverview<T>(value: T, ttlMs = DEFAULT_TTL_MS): void {
  overviewCache = { value, expiresAt: Date.now() + ttlMs };
}

export function clearAdminAnalyticsOverviewCache(): void {
  overviewCache = null;
}
