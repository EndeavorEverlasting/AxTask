import type { AiIntentResult } from "../schemas/intent-result";
import { assertCanCreateTasks, storage } from "../../storage";

export type CreateTaskToolResult =
  | { ok: true; taskId: string; message: string }
  | { ok: false; clarification: string; reason: string };

export async function executeCreateTaskIntent(
  userId: string,
  intent: Extract<AiIntentResult, { type: "create_task" }>,
): Promise<CreateTaskToolResult> {
  const quota = await assertCanCreateTasks(userId, 1);
  if (!quota.ok) {
    return {
      ok: false,
      clarification: quota.message ?? "You cannot create more tasks right now.",
      reason: "quota_exceeded",
    };
  }

  const { activity, notes, date } = intent.payload;
  const dateStr = date ?? new Date().toISOString().slice(0, 10);

  const task = await storage.createTask(userId, {
    activity,
    notes: notes ?? "",
    date: dateStr,
    recurrence: "none",
    status: "pending",
    visibility: "private",
    communityShowNotes: false,
  });

  return {
    ok: true,
    taskId: task.id,
    message: `Created task: ${task.activity}`,
  };
}
