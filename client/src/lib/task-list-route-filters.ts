/**
 * Route-level saved filters for the /tasks page.
 *
 * Planner tiles and other navigation points deep-link into the task list
 * with a `?filter=overdue|today|week|pending` param. TaskListHost hydrates
 * those on mount, strips them from the URL, and exposes a dismissable
 * "Showing: …" chip so the user can clear the saved filter without
 * hunting for the right dropdown combination.
 *
 * Kept as a standalone module so:
 *   - `planner.tsx` can import the type + builder without pulling in the
 *     whole TaskListHost tree.
 *   - The matching logic is easy to unit test in jsdom without mounting
 *     React.
 */
import type { Task } from "@shared/schema";

export type TaskListRouteFilter =
  | "none"
  | "overdue"
  | "today"
  | "week"
  | "pending";

export interface TaskListRouteState {
  filter: TaskListRouteFilter;
  q: string;
}

const VALID_FILTERS = new Set<TaskListRouteFilter>([
  "overdue",
  "today",
  "week",
  "pending",
]);

function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function startOfWeekIso(now = new Date()): string {
  const d = new Date(now);
  const dow = d.getDay();
  /* ISO-ish week: Sunday == 0, so we subtract `dow` days to land on Sunday.
   * This matches the planner briefing which displays a 7-day window keyed
   * to the user's locale week. */
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}

function endOfWeekIso(now = new Date()): string {
  const d = new Date(now);
  const dow = d.getDay();
  d.setDate(d.getDate() + (6 - dow));
  return d.toISOString().slice(0, 10);
}

export function readTaskListRouteFilters(
  search?: string,
): TaskListRouteState {
  const raw =
    search ??
    (typeof window !== "undefined" ? window.location.search : "");
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return { filter: "none", q: "" };
  }
  const filterRaw = params.get("filter")?.toLowerCase() ?? "";
  const filter: TaskListRouteFilter = VALID_FILTERS.has(
    filterRaw as TaskListRouteFilter,
  )
    ? (filterRaw as TaskListRouteFilter)
    : "none";
  const q = params.get("q") ?? "";
  return { filter, q };
}

export function clearTaskListRouteFilters(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const hadAny =
      url.searchParams.has("filter") || url.searchParams.has("q");
    if (!hadAny) return;
    url.searchParams.delete("filter");
    url.searchParams.delete("q");
    const next = url.pathname + (url.search ? url.search : "") + url.hash;
    window.history.replaceState(window.history.state, "", next);
  } catch {
    /* swallow — best-effort URL cleanup */
  }
}

export function describeRouteFilter(filter: TaskListRouteFilter): string {
  switch (filter) {
    case "overdue":
      return "Overdue";
    case "today":
      return "Due today";
    case "week":
      return "This week";
    case "pending":
      return "All pending";
    case "none":
    default:
      return "";
  }
}

export function buildTaskListHref(
  filter: TaskListRouteFilter,
  q?: string,
): string {
  const params = new URLSearchParams();
  if (filter !== "none") params.set("filter", filter);
  if (q && q.trim().length > 0) params.set("q", q.trim());
  const qs = params.toString();
  return qs ? `/tasks?${qs}` : "/tasks";
}

/**
 * Pure predicate: does this task match the given saved filter?
 *
 * "Today" and "Week" use the local today/week window. "Pending" is a
 * simple status filter. "Overdue" is status != completed AND date < today.
 */
export function taskMatchesRouteFilter(
  task: Task,
  filter: TaskListRouteFilter,
  now: Date = new Date(),
): boolean {
  if (filter === "none") return true;
  const today = todayIso(now);
  switch (filter) {
    case "overdue":
      return task.status !== "completed" && task.date < today;
    case "today":
      return task.date === today;
    case "week": {
      const lo = startOfWeekIso(now);
      const hi = endOfWeekIso(now);
      return task.date >= lo && task.date <= hi;
    }
    case "pending":
      return task.status !== "completed";
    default:
      return true;
  }
}
