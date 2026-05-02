import type { Express, Request, Response, NextFunction } from "express";
import { getBackupStatus } from "../services/backup-service";

type RequireAuthMiddleware = (req: Request, res: Response, next: NextFunction) => unknown;

export function registerBackupRoutes(app: Express, requireAuth: RequireAuthMiddleware) {
  app.get("/api/account/backup/status", requireAuth, async (req, res) => {
    try {
      const status = await getBackupStatus(req.user!.id);
      res.json(status);
    } catch (error) {
      res.status(500).json({ message: "Failed to load backup status" });
    }
  });
}
