import type { Express, Request, Response, NextFunction } from "express";
import { getBackupStatus, isAutomaticBackupsConfigured } from "../services/backup-service";
import { getLastBackupRecordForUser, upsertUserBackupPreference } from "../storage";
import { db } from "../db";
import { desc } from "drizzle-orm";
import { backupRecords } from "@shared/schema";

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

  app.patch("/api/account/backup/preferences", requireAuth, async (req, res) => {
    try {
      const { autoBackupEnabled, preferredTarget } = req.body || {};
      const pref = await upsertUserBackupPreference({
        userId: req.user!.id,
        autoBackupEnabled: typeof autoBackupEnabled === "boolean" ? autoBackupEnabled : undefined,
        preferredTarget: typeof preferredTarget === "string" ? preferredTarget : undefined,
      });
      res.json(pref);
    } catch (error) {
      res.status(500).json({ message: "Failed to update backup preferences" });
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

    app.get("/api/admin/backup/health", requireAdmin, async (_req, res) => {
      try {
        // Grab the most recent backup record across all users
        const [latest] = await db
          .select()
          .from(backupRecords)
          .orderBy(desc(backupRecords.createdAt))
          .limit(1);

        const health = {
          schedulerEnabled: isAutomaticBackupsConfigured(),
          latestBackupRecord: latest
            ? {
                status: latest.status,
                createdAt: latest.createdAt?.toISOString() ?? null,
                completedAt: latest.completedAt?.toISOString() ?? null,
                type: latest.type,
                hasError: !!latest.errorMessage,
              }
            : null,
          envTarget: process.env.BACKUP_S3_ENDPOINT ? "s3" : "local",
          writable: true, // placeholder: real write-test requires target instantiation
        };

        const isHealthy =
          !isAutomaticBackupsConfigured() ||
          (latest && latest.status === "completed" && !latest.errorMessage);

        res.status(isHealthy ? 200 : 503).json(health);
      } catch (error) {
        res.status(500).json({ message: "Failed to check backup health" });
      }
    });
  }
}
