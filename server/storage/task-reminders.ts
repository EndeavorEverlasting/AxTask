import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "../db";
import { taskReminders, tasks } from "@shared/schema";

export type DueTaskReminderRow = typeof taskReminders.$inferSelect;

export async function getTaskOwnedByUser(taskId: string, userId: string) {
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createTaskReminder(input: {
  userId: string;
  taskId?: string | null;
  activity: string;
  remindAt: Date;
  recurrenceRule?: string | null;
  deliveryChannel?: string;
}) {
  const [row] = await db
    .insert(taskReminders)
    .values({
      userId: input.userId,
      taskId: input.taskId ?? null,
      activity: input.activity,
      remindAt: input.remindAt,
      recurrenceRule: input.recurrenceRule ?? null,
      deliveryChannel: input.deliveryChannel ?? "auto",
      status: "pending",
    })
    .returning();
  return row;
}

export async function listDueTaskReminderRows(now: Date, limit = 100): Promise<DueTaskReminderRow[]> {
  return db
    .select()
    .from(taskReminders)
    .where(and(eq(taskReminders.status, "pending"), lte(taskReminders.remindAt, now)))
    .orderBy(asc(taskReminders.remindAt))
    .limit(Math.max(1, limit));
}

export async function finalizeTaskReminderDispatch(input: {
  taskReminderId: string;
  firedAt: Date;
  nextRemindAt: Date | null;
}) {
  const [row] = await db
    .update(taskReminders)
    .set({
      remindAt: input.nextRemindAt ?? input.firedAt,
      status: input.nextRemindAt ? "pending" : "completed",
      updatedAt: input.firedAt,
    })
    .where(eq(taskReminders.id, input.taskReminderId))
    .returning();
  return row ?? null;
}
