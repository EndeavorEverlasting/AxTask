import type { ParsedCommand } from "./intent-types";

/** Mirrors `server/engines/dispatcher` `IntentType` (shared cannot import the server). */
export type EngineIntentName =
  | "task_create"
  | "planner_query"
  | "calendar_command"
  | "navigation"
  | "search"
  | "task_review"
  | "alarm_config";

/**
 * Map structured parser output to the voice engine intent bucket. Returns `null`
 * for `unknown` so the caller can fall back to legacy `classifyIntent`.
 */
export function mapParsedCommandToIntent(parsed: ParsedCommand): EngineIntentName | null {
  if (parsed.kind === "unknown") return null;
  switch (parsed.kind) {
    case "navigation":
      return "navigation";
    case "alarm_list":
    case "create_reminder":
      return "alarm_config";
    case "search":
      return "search";
    case "planning_request":
      return "planner_query";
    case "task_review":
      return "task_review";
    case "create_task":
    case "create_recurring_task":
      return "task_create";
  }
}
