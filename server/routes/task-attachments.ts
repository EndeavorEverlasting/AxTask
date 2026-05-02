import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getTaskAttachments, linkAttachmentToTask } from "../storage";

type RequireAuthMiddleware = (req: Request, res: Response, next: NextFunction) => unknown;

export function registerTaskAttachmentRoutes(app: Express, requireAuth: RequireAuthMiddleware) {
  app.get("/api/tasks/:taskId/attachments", requireAuth, async (req, res) => {
    try {
      const assets = await getTaskAttachments(req.user!.id, req.params.taskId);
      res.json(assets);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch task attachments" });
    }
  });

  app.post("/api/tasks/:taskId/attachments/link", requireAuth, async (req, res) => {
    try {
      const { assetId } = z.object({ assetId: z.string().min(1) }).parse(req.body);
      const linked = await linkAttachmentToTask(req.user!.id, assetId, req.params.taskId);
      if (!linked) return res.status(404).json({ message: "Attachment not found" });
      res.json(linked);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to link attachment to task" });
    }
  });
}
