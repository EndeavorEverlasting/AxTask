import type { Express, Request, Response, NextFunction } from "express";
import { getBackupStatus, isAutomaticBackupsConfigured } from "../services/backup-service";

type RequireAuthMiddleware = (req: Request, res: Response, next: NextFunction) => unknown;
type RequireAdminMiddleware = (req: Request, res: Response, next: NextFunction) => unknown;

export function registerBackupRoutes(
  app: Express,
  requireAuth: RequireAuthMiddleware,
  requireAdmin?: RequireAdminMiddleware,
) {
  app.get("/api/account/backup/status", requireAuth, async (req, res) => {
    try {
      const status = await getBackupStatus(req.user!.id);
      res.json(status);
    } catch (error) {
      res.status(500).json({ message: "Failed to load backup status" });
    }
  });

  if (requireAdmin) {
    app.get("/api/admin/backup/config", requireAdmin, (_req, res) => {
      res.json({
        automaticBackupsConfigured: isAutomaticBackupsConfigured(),
        intervalMs: Number(process.env.BACKUP_SCHEDULER_INTERVAL_MS) || 24 * 60 * 60 * 1000,
        target: process.env.BACKUP_S3_ENDPOINT ? "s3" : "local",
        s3Bucket: process.env.BACKUP_S3_BUCKET || null,
        localDir: process.env.BACKUP_LOCAL_DIR || null,
      });
    });
  }
}
