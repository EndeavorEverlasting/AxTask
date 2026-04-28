import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { createReminderSchema, reminderKindSchema } from "@shared/schema";
import { createReminderWithTrigger, listUserReminders, updateReminder, disableReminder } from "../storage/reminders";

const updateReminderSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    body: z.string().max(2000).nullable().optional(),
    enabled: z.boolean().optional(),
    kind: reminderKindSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, "At least one field is required");

type RequireAuthMiddleware = (req: Request, res: Response, next: NextFunction) => unknown;

export function registerReminderRoutes(app: Express, requireAuth: RequireAuthMiddleware) {
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
              nextRunAt: null,
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
}
