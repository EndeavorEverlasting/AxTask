import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { AXTASK_CLIENT_INSTANCE_HEADER, AXTASK_CSRF_COOKIE, AXTASK_CSRF_HEADER } from "@shared/http-auth";
import { getClientInstanceId } from "./client-instance-id";

const csrfCookiePattern = new RegExp(
  `(?:^|;\\s*)${AXTASK_CSRF_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`,
);

export class ApiError extends Error {
  readonly status: number;
  readonly errorClass?: string;
  readonly retryable: boolean;
  readonly requestId?: string;

  constructor(
    status: number,
    message: string,
    options?: { errorClass?: string; retryable?: boolean; requestId?: string },
  ) {
    super(`${status}: ${message}`);
    this.name = "ApiError";
    this.status = status;
    this.errorClass = options?.errorClass;
    this.retryable = options?.retryable === true;
    this.requestId = options?.requestId;
  }
}

function parseErrorPayload(text: string): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export async function throwIfResNotOk(
  res: Response,
  options?: { allowDbReadRetry?: boolean },
): Promise<void> {
  if (res.ok) return;

  const text = (await res.text()) || res.statusText;
  const payload = parseErrorPayload(text);
  const message =
    payload && typeof payload.message === "string"
      ? payload.message
      : text || res.statusText || "Request failed";
  const errorClass =
    payload && typeof payload.errorClass === "string"
      ? payload.errorClass
      : undefined;
  const serverRetryable =
    payload && payload.retryable === true &&
    typeof errorClass === "string" && errorClass.startsWith("DB_");
  const retryable = options?.allowDbReadRetry === true && serverRetryable;
  const requestIdFromBody =
    payload && typeof payload.requestId === "string"
      ? payload.requestId
      : undefined;
  const requestId = requestIdFromBody || res.headers.get("x-request-id") || undefined;

  throw new ApiError(res.status, message, {
    errorClass,
    retryable,
    requestId,
  });
}

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return (
    failureCount < 2 &&
    error instanceof ApiError &&
    error.status === 503 &&
    error.retryable
  );
}

export function queryRetryDelayMs(failureIndex: number): number {
  return Math.min(250 * (2 ** Math.max(0, failureIndex)), 1_000);
}

export function getCsrfToken(): string | null {
  const match = document.cookie.match(csrfCookiePattern);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Same as {@link apiRequest} but does not throw on non-OK status (for conflict handling). */
export async function apiFetch(
  method: string,
  url: string,
  data?: unknown | undefined,
  extraHeaders?: Record<string, string>,
  signal?: AbortSignal,
): Promise<Response> {
  const headers: Record<string, string> = { ...(extraHeaders || {}) };
  if (data !== undefined && data !== null) headers["Content-Type"] = "application/json";
  const csrfToken = getCsrfToken();
  if (csrfToken && method !== "GET") headers[AXTASK_CSRF_HEADER] = csrfToken;
  headers[AXTASK_CLIENT_INSTANCE_HEADER] = getClientInstanceId();

  return fetch(url, {
    method,
    headers,
    body: data !== undefined && data !== null ? JSON.stringify(data) : undefined,
    credentials: "include",
    signal,
  });
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const res = await apiFetch(method, url, data, extraHeaders);
  // apiRequest may be used from queryFn with POST (for example classifier
  // suggestions). Keep it non-retryable by default; only the built-in GET
  // query function below opts into DB-read retries.
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: {
        [AXTASK_CLIENT_INSTANCE_HEADER]: getClientInstanceId(),
      },
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res, { allowDbReadRetry: true });
    return await res.json();
  };

/** Default stale window before background refetch (Phase A: readable “stale” state). */
export const DEFAULT_QUERY_STALE_TIME_MS = 5 * 60 * 1000;

/**
 * Global react-query defaults.
 *
 * `refetchOnWindowFocus` is **false** by default. Tab-focus refetch was
 * causing visible jank (scroll interruptions, reshuffled DOM, re-parse of
 * markdown + avatars) every time the user Alt-Tabbed back into AxTask, and
 * the perceived data value was low because most AxTask surfaces already
 * poll or invalidate on mutation. Surfaces that genuinely need
 * focus-refresh must opt in explicitly — see the query-defaults audit in
 * `docs/PERF_PERFORMANCE_BUDGETS.md` for the list of callers that opt in.
 *
 * `refetchInterval` is `false` by default for the same reason. Admin
 * surfaces that want live data (security events, analytics overview,
 * db-size card, storage rollups) opt in at the `useQuery` site with a
 * deliberate interval, scoped to their `enabled: adminApiEnabled` gate so
 * the polling only fires while an admin is looking at the panel.
 *
 * Only the built-in GET query function opts into transient DB 503 retries.
 * Custom query functions (including POST-backed reads) and all mutations stay
 * non-retried so AxTask cannot replay side-effecting work after ambiguity.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      staleTime: DEFAULT_QUERY_STALE_TIME_MS,
      gcTime: 24 * 60 * 60 * 1000,
      networkMode: "offlineFirst",
      retry: shouldRetryQuery,
      retryDelay: queryRetryDelayMs,
    },
    mutations: {
      retry: false,
    },
  },
});
