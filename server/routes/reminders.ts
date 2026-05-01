import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { createReminderSchema, reminderKindSchema } from "@shared/schema";
import {
  computeNextRunAtFromRecurrence,
  createReminderWithTrigger,
  listUserReminders,
  listUserRemindersWithPrimaryTrigger,
  updateReminder,
  disableReminder,
} from "../storage/reminders";
import { listTaskRemindersForUser, cancelTaskReminder } from "../storage/task-reminders";

const updateReminderSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    body: z.string().max(2000).nullable().optional(),
    enabled: z.boolean().optional(),
    kind: reminderKindSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "At least one field is required");

type RequireAuthMiddleware = (req: Request, res: Response, next: NextFunction) => unknown;
type ReminderSummaryItem = {
  source: "task_reminder" | "ops_reminder";
  id: string;
  taskId?: string | null;
  title: string;
  body?: string | null;
  nextRunAt?: string | null;
  remindAt?: string | null;
  triggerType?: string | null;
  recurrenceRule?: string | null;
  status?: string;
  enabled?: boolean;
  createdAt?: string | null;
};

export function registerReminderRoutes(app: Express, requireAuth: RequireAuthMiddleware) {
  app.get("/api/reminders/summary", requireAuth, async (req, res) => {
    try {
      const [opsRows, taskRows] = await Promise.all([
        listUserRemindersWithPrimaryTrigger(req.user!.id),
        listTaskRemindersForUser(req.user!.id),
      ]);

      const opsItems: ReminderSummaryItem[] = opsRows.map(({ reminder, trigger }) => {
        const payload = trigger?.payloadJson as { recurrence?: unknown } | null | undefined;
        return {
          source: "ops_reminder",
          id: reminder.id,
          taskId: null,
          title: reminder.title,
          body: reminder.body ?? null,
          nextRunAt: trigger?.nextRunAt ? new Date(String(trigger.nextRunAt)).toISOString() : null,
          remindAt: null,
          triggerType: trigger?.triggerType ?? null,
          recurrenceRule: payload?.recurrence ? JSON.stringify(payload.recurrence) : null,
          status: reminder.enabled ? "enabled" : "disabled",
          enabled: reminder.enabled,
          createdAt: reminder.createdAt ? new Date(String(reminder.createdAt)).toISOString() : null,
        };
      });

      const taskItems: ReminderSummaryItem[] = taskRows.map((row) => {
        return {
          source: "task_reminder",
          id: row.id,
          taskId: row.taskId,
          title: row.activity,
          body: null,
          nextRunAt: null,
          remindAt: new Date(String(row.remindAt)).toISOString(),
          triggerType: null,
          recurrenceRule: row.recurrenceRule ?? null,
          status: row.status ?? "unknown",
          enabled: row.status === "pending",
          createdAt: row.createdAt ? new Date(String(row.createdAt)).toISOString() : null,
        };
      });

      const unified = [
        ...opsItems,
        ...taskItems,
      ];

      res.json({ reminders: unified });
    } catch (error) {
      res.status(500).json({ message: "Failed to load reminders summary" });
    }
  });

  app.get("/api/reminders", requireAuth, async (req, res) => {
    try {
      const rows = await listUserReminders(req.user!.id);
      res.json({ reminders: rows });
    } catch (error) {
      res.status(500).json({ message: "Failed to list reminders" });
    }
  });

  app.post("/api/reminders", requireAuth, async (req, res) => {
    try {
      const body = createReminderSchema.parse(req.body || {});
      const isActive = body.enabled ?? true;
      const trigger =
        body.trigger.type === "datetime"
          ? {
              triggerType: "datetime",
              payloadJson: body.trigger,
              nextRunAt: new Date(body.trigger.atIso),
              cooldownSeconds: 0,
              isActive,
            }
          : {
              triggerType: body.trigger.type,
              payloadJson: body.trigger,
              nextRunAt:
                body.trigger.type === "recurring_time"
                  ? computeNextRunAtFromRecurrence(body.trigger, new Date())
                  : null,
              cooldownSeconds: 0,
              isActive,
            };

      const created = await createReminderWithTrigger({
        reminder: {
          userId: req.user!.id,
          kind: body.kind,
          title: body.title,
          body: body.body ?? null,
          enabled: body.enabled ?? true,
          createdBy: "user",
        },
        trigger,
      });

      res.status(201).json(created);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to create reminder" });
    }
  });

  app.patch("/api/reminders/:id", requireAuth, async (req, res) => {
    try {
      const patch = updateReminderSchema.parse(req.body || {});
      const row = await updateReminder(req.params.id, req.user!.id, patch);
      if (!row) return res.status(404).json({ message: "Reminder not found" });
      res.json(row);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to update reminder" });
    }
  });

  app.delete("/api/reminders/:id", requireAuth, async (req, res) => {
    try {
      const row = await disableReminder(req.params.id, req.user!.id);
      if (!row) return res.status(404).json({ message: "Reminder not found" });
      res.json({ ok: true, reminder: row });
    } catch (error) {
      res.status(500).json({ message: "Failed to disable reminder" });
    }
  });

  app.patch("/api/task-reminders/:id/cancel", requireAuth, async (req, res) => {
    try {
      const row = await cancelTaskReminder(req.params.id, req.user!.id);
      if (!row) return res.status(404).json({ message: "Task reminder not found" });
      res.json(row);
    } catch (error) {
      res.status(500).json({ message: "Failed to cancel task reminder" });
    }
  });
}
