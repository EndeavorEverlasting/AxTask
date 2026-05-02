import type { Express, Request, Response, NextFunction } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  listUserAlarmSnapshots,
  createUserAlarmSnapshot,
  getUserAlarmSnapshot,
} from "../storage";

type RequireAuthMiddleware = (req: Request, res: Response, next: NextFunction) => unknown;

const alarmSnapshotBodySchema = z.object({
  deviceKey: z.string().max(80).optional(),
  label: z.string().max(120).optional(),
  payloadJson: z.string().min(2).max(500_000),
});

export function registerAlarmRoutes(app: Express, requireAuth: RequireAuthMiddleware) {
  app.get("/api/alarm-snapshots", requireAuth, async (req, res) => {
    try {
      const rows = await listUserAlarmSnapshots(req.user!.id);
      res.json({
        snapshots: rows.map((r) => ({
          id: r.id,
          deviceKey: r.deviceKey,
          label: r.label,
          capturedAt: r.capturedAt,
          createdAt: r.createdAt,
        })),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to list alarm snapshots" });
    }
  });

  app.post("/api/alarm-snapshots", requireAuth, async (req, res) => {
    try {
      const body = alarmSnapshotBodySchema.parse(req.body || {});
      const row = await createUserAlarmSnapshot(req.user!.id, body);
      res.status(201).json({
        id: row.id,
        deviceKey: row.deviceKey,
        label: row.label,
        capturedAt: row.capturedAt,
      });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to save alarm snapshot" });
    }
  });

  app.get("/api/alarm-snapshots/:id/payload", requireAuth, async (req, res) => {
    try {
      const row = await getUserAlarmSnapshot(req.user!.id, req.params.id);
      if (!row) return res.status(404).json({ message: "Snapshot not found" });
      res.json({ payloadJson: row.payloadJson, label: row.label, deviceKey: row.deviceKey, capturedAt: row.capturedAt });
    } catch (error) {
      res.status(500).json({ message: "Failed to load alarm snapshot" });
    }
  });

  app.get("/api/alarm-capabilities", requireAuth, async (_req, res) => {
    const companionApplyUrl = (process.env.AXTASK_ALARM_COMPANION_URL || "").trim();
    const companionSecretConfigured = (process.env.AXTASK_ALARM_COMPANION_SECRET || "").trim().length > 0;
    res.json({
      companionConfigured: companionApplyUrl.length > 0,
      companionSecretConfigured,
      nativeBridgeHints: {
        android: process.env.VITE_ENABLE_ANDROID_REMINDERS === "true",
        windows: process.env.VITE_ENABLE_WINDOWS_REMINDERS === "true",
      },
    });
  });

  app.post("/api/alarm-companion/apply", requireAuth, async (req, res) => {
    try {
      const companionApplyUrl = (process.env.AXTASK_ALARM_COMPANION_URL || "").trim();
      if (!companionApplyUrl) {
        return res.status(503).json({ message: "Alarm companion endpoint is not configured" });
      }
      const body = z.object({ payloadJson: z.string().min(2).max(500_000) }).parse(req.body || {});
      const companionSecret = (process.env.AXTASK_ALARM_COMPANION_SECRET || "").trim();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      try {
        const t0 = Date.now();
        const headers: Record<string, string> = { "content-type": "application/json" };
        if (companionSecret) {
          headers.authorization = `Bearer ${companionSecret}`;
        }
        const hashedId = createHash("sha256").update(req.user!.id).digest("hex").slice(0, 16);
        const upstream = await fetch(companionApplyUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            userId: hashedId,
            payloadJson: body.payloadJson,
          }),
          signal: controller.signal,
        });
        const text = await upstream.text();
        const ms = Date.now() - t0;
        const uid = req.user!.id;
        const uidShort = uid.length > 8 ? `${uid.slice(0, 8)}…` : uid;
        console.log(
          `[alarm-companion-proxy] user=${uidShort} status=${upstream.status} ms=${ms} payloadBytes=${body.payloadJson.length}`,
        );
        if (!upstream.ok) {
          return res.status(502).json({
            message: "Companion apply failed",
            companionStatus: upstream.status,
          });
        }
        return res.json({ ok: true, companionResponse: text || "ok" });
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      return res.status(500).json({ message: "Failed to apply alarm via companion" });
    }
  });
}
