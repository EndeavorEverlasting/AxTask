import type { ParsedCommand } from "./intent-types";

export type CommandExecutionPolicy = "autoRun" | "review" | "block";

/**
 * Shared execution policy used by both typed command previews and server dispatch.
 * This keeps "what can run now" deterministic across input channels.
 */
export function getCommandExecutionPolicy(command: ParsedCommand): CommandExecutionPolicy {
  if (command.kind === "unknown") return "block";

  if (
    command.kind === "create_task" ||
    command.kind === "create_reminder" ||
    command.kind === "create_recurring_task" ||
    command.kind === "task_review" ||
    command.kind === "planning_request"
  ) {
    return "review";
  }

  if (command.confidence < 0.55) return "review";
  return "autoRun";
}

