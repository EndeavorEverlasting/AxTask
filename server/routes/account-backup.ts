import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { buildUserExportBundle, buildImportChallenge, runAccountImport } from "../account-backup";
import { importUserBundle, validateBundle } from "../migration/import";
import { MFA_PURPOSES } from "@shared/mfa-purposes";
import { verifyMfaChallengeOrTotp } from "../services/mfa-totp";
import { appendSecurityEvent } from "../storage";

type RequireAuthMiddleware = (req: Request, res: Response, next: NextFunction) => unknown;

const DATA_EXPORT_STEP_UP_TTL_MS = 60 * 60 * 1000;

function requireDataExportStepUp(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV !== "production") {
    return next();
  }
  const exp = req.session.dataExportStepUp?.expiresAt;
  if (typeof exp === "number" && exp > Date.now()) {
    return next();
  }
  return res.status(403).json({ message: "Verify your email before downloading or importing a JSON backup" });
}

/**
 * Migration exports contain a `users` table and preserve table-shaped rows with
 * IDs/FKs. Backup Center downloads are intentionally smaller semantic bundles
 * (`tasks`, `walletSnapshot`, `badges`) and must stay on runAccountImport(),
 * which rebuilds account-owned rows and keeps wallet balances ledger-safe.
 */
export function isMigrationUserExportBundle(
  bundle: unknown,
): bundle is import("../migration/export").ExportBundle {
  if (!bundle || typeof bundle !== "object") return false;
  const record = bundle as Record<string, unknown>;
  const metadata = (record.metadata || {}) as Record<string, unknown>;
  const data = (record.data || {}) as Record<string, unknown>;
  return (
    metadata.exportMode === "user" &&
    metadata.schemaVersion === 1 &&
    Array.isArray(data.users) &&
    data.users.length > 0
  );
}

export function registerAccountBackupRoutes(app: Express, requireAuth: RequireAuthMiddleware) {
  app.get("/api/account/data-export-step-up-status", requireAuth, async (req, res) => {
    try {
      const stepUpRequired = process.env.NODE_ENV === "production";
      const exp = req.session.dataExportStepUp?.expiresAt;
      const stepUpSatisfied =
        !stepUpRequired || (typeof exp === "number" && exp > Date.now());
      const expiresAt = typeof exp === "number" && exp > Date.now() ? exp : null;
      res.json({ stepUpRequired, stepUpSatisfied, expiresAt });
    } catch {
      res.status(500).json({ message: "Failed to load verification status" });
    }
  });

  app.post("/api/account/data-export-step-up", requireAuth, async (req, res) => {
    try {
      const { challengeId, code } = z
        .object({
          challengeId: z.string().min(1),
          code: z.string().trim().length(6),
        })
        .parse(req.body);
      const ok = await verifyMfaChallengeOrTotp(
        req.user!.id,
        challengeId,
        code,
        MFA_PURPOSES.ACCOUNT_DATA_EXPORT,
      );
      if (!ok) {
        await appendSecurityEvent({
          eventType: "mfa_verify_failed",
          actorUserId: req.user!.id,
          route: req.path,
          method: req.method,
          statusCode: 403,
          ipAddress: req.ip,
          userAgent: req.get("user-agent") || undefined,
          payload: { context: "account_data_export_step_up" },
        });
        return res.status(403).json({ message: "Invalid or expired code" });
      }
      req.session.dataExportStepUp = { expiresAt: Date.now() + DATA_EXPORT_STEP_UP_TTL_MS };
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });
      await appendSecurityEvent({
        eventType: "account_data_export_step_up_ok",
        actorUserId: req.user!.id,
        route: req.path,
        method: req.method,
        statusCode: 200,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
      });
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to verify" });
    }
  });

  app.get("/api/account/export", requireAuth, requireDataExportStepUp, async (req, res) => {
    try {
      const bundle = await buildUserExportBundle(req.user!.id);
      await appendSecurityEvent({
        eventType: "account_json_export",
        actorUserId: req.user!.id,
        route: req.path,
        method: req.method,
        statusCode: 200,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
        payload: { taskCount: bundle.data.tasks?.length ?? 0 },
      });
      res.json(bundle);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to export account backup" });
    }
  });

  app.post("/api/account/import/challenge", requireAuth, requireDataExportStepUp, async (req, res) => {
    try {
      // Full migration-style user exports already carry table identity/FK structure.
      // Backup Center semantic bundles must use the ownership challenge below.
      if (isMigrationUserExportBundle(req.body?.bundle)) {
        return res.json({
          ownershipQuizRequired: false,
          tasksFingerprint: "",
          questionCount: 0,
          questions: [],
        });
      }
      const ch = buildImportChallenge(req.body?.bundle);
      if (ch.message) {
        return res.status(400).json(ch);
      }
      res.json(ch);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to build import challenge" });
    }
  });

  app.post("/api/account/import", requireAuth, requireDataExportStepUp, async (req, res) => {
    try {
      const body = z
        .object({
          bundle: z.unknown(),
          dryRun: z.boolean(),
          importOwnershipAnswers: z
            .array(
              z.object({
                questionId: z.string(),
                selectedIndex: z.number().int(),
              }),
            )
            .optional(),
        })
        .parse(req.body);
      if (isMigrationUserExportBundle(body.bundle)) {
        const validation = validateBundle(body.bundle);
        if (validation.errors.length > 0) {
          return res.status(400).json({ message: "Bundle validation failed", errors: validation.errors });
        }
        const result = await importUserBundle(body.bundle, req.user!.id, { dryRun: body.dryRun });
        return res.json(result);
      }
      const result = await runAccountImport({
        userId: req.user!.id,
        bundle: body.bundle,
        dryRun: body.dryRun,
        importOwnershipAnswers: body.importOwnershipAnswers,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
      });
      res.json(result);
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to import account backup" });
    }
  });
}
