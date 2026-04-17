/**
 * Task list UI performance constants (client-side).
 *
 * Triage (post fc86e95): the task list grew heavier (virtualization, motion, layout probes).
 * Biggest steady-state wins: virtualize sooner, trim per-row layout work, cap expensive
 * server search payloads, and keep analytics sub-requests parallel where independent.
 */

/** When visible rows exceed this count, use windowed rendering (TanStack Virtual + DnD). */
export const TASK_LIST_VIRTUALIZE_THRESHOLD = 80;

/** Rows rendered above/below the viewport window (lower = less DOM/RAM; higher = smoother fast scroll). */
export const TASK_LIST_VIRTUALIZER_OVERSCAN = 12;

export function shouldVirtualizeTaskList(
  rowCount: number,
  threshold: number = TASK_LIST_VIRTUALIZE_THRESHOLD,
): boolean {
  return rowCount > threshold;
}

export { TASK_SEARCH_RESULT_LIMIT } from "@shared/task-list-limits";
