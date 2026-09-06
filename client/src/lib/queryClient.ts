import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { AXTASK_CLIENT_INSTANCE_HEADER, AXTASK_CSRF_COOKIE, AXTASK_CSRF_HEADER } from "@shared/http-auth";
import type { TaskImportIdentityInput } from "@shared/task-import-identity";
import { getClientInstanceId } from "./client-instance-id";
import { verifyImportedTaskPresence } from "./import-verification";

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
  headers[AXTASK_CLIENT_INSTANCE_HEADER] = getClientInstanceId();

  return fetch(url, {
    method,
    headers,
    body: data !== undefined && data !== null ? JSON.stringify(data) : undefined,
    credentials: "include",
    signal,
  });
}

type TaskImportApiSummary = {
  failed?: unknown;
  skippedAsDuplicate?: unknown;
};

function isTaskImportRequest(method: string, url: string): boolean {
  return method.toUpperCase() === "POST" && url === "/api/tasks/import";
}

function refreshTaskCachesAfterImportError(): void {
  void queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
  void queryClient.invalidateQueries({ queryKey: ["/api/tasks/stats"] });
}

/**
 * Spreadsheet import is intentionally a stronger boundary than a generic API
 * request. Newly inserted rows are returned by the database insert itself. A
 * duplicate skip, however, is only safe to present as success when the logical
 * task is still visible in the authenticated task list. This postcondition
 * prevents a stale fingerprint row from becoming a false-green import result.
 */
async function enforceTaskImportPostcondition(
  method: string,
  url: string,
  data: unknown,
  response: Response,
): Promise<void> {
  if (!isTaskImportRequest(method, url)) return;

  const requestedTasks = (data as { tasks?: unknown } | null)?.tasks;
  if (!Array.isArray(requestedTasks) || requestedTasks.length === 0) return;

  let summary: TaskImportApiSummary;
  try {
    summary = (await response.clone().json()) as TaskImportApiSummary;
  } catch {
    throw new Error("Task import returned an unreadable result; completion cannot be verified.");
  }

  const failed = typeof summary.failed === "number" ? summary.failed : 0;
  if (failed > 0) {
    throw new Error(
      `Task import needs attention: ${failed} row(s) failed validation. Successfully imported rows were kept and will be deduplicated on retry.`,
    );
  }

  const skippedAsDuplicate =
    typeof summary.skippedAsDuplicate === "number" ? summary.skippedAsDuplicate : 0;
  if (skippedAsDuplicate <= 0) return;

  const verifyResponse = await apiFetch("GET", "/api/tasks");
  await throwIfResNotOk(verifyResponse);
  const currentTasks = await verifyResponse.json();
  if (!Array.isArray(currentTasks)) {
    throw new Error("Task import verification returned an invalid task-list payload.");
  }

  const verification = verifyImportedTaskPresence(
    requestedTasks as TaskImportIdentityInput[],
    currentTasks as TaskImportIdentityInput[],
  );

  if (verification.missingLogicalTasks > 0) {
    throw new Error(
      `Task import postcondition failed: ${verification.missingLogicalTasks} of ${verification.expectedLogicalTasks} selected logical task(s) are missing after duplicate handling. Completion was not accepted.`,
    );
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const taskImportRequest = isTaskImportRequest(method, url);
  try {
    const res = await apiFetch(method, url, data, extraHeaders);
    await throwIfResNotOk(res);
    await enforceTaskImportPostcondition(method, url, data, res);
    return res;
  } catch (error) {
    if (taskImportRequest) refreshTaskCachesAfterImportError();
    throw error;
  }
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

    await throwIfResNotOk(res);
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
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});