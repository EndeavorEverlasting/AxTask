import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { AXTASK_CSRF_COOKIE, AXTASK_CSRF_HEADER } from "@shared/http-auth";

const csrfCookiePattern = new RegExp(
  `(?:^|;\\s*)${AXTASK_CSRF_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`,
);

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
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
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

/** Default stale window before background refetch (Phase A: readable “stale” state). */
export const DEFAULT_QUERY_STALE_TIME_MS = 5 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      staleTime: DEFAULT_QUERY_STALE_TIME_MS,
      gcTime: 24 * 60 * 60 * 1000,
      networkMode: "offlineFirst",
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
