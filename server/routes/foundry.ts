import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { collectFoundryGitStatus } from "../services/foundry-git-status";
import { appendFoundryRunLog, listFoundryRunLogs } from "../storage/foundry";

const appendRunSchema = z.object({
  branch: z.string().max(200).optional().nullable(),
  commitSha: z.string().max(64).optional().nullable(),
  dirtySummary: z.string().max(500).optional().nullable(),
  checkOutcome: z.enum(["pass", "fail", "skipped"]).optional().nullable(),
  testOutcome: z.enum(["pass", "fail", "skipped"]).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

function isFoundryEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_FOUNDRY === "true";
}

function requireFoundryEnabled(_req: Request, res: Response, next: NextFunction) {
  if (!isFoundryEnabled()) {
    return res.status(404).json({ message: "Not found" });
  }
  next();
}

type AdminMiddleware = (req: Request, res: Response, next: NextFunction) => unknown;

export function registerFoundryRoutes(
  app: Express,
  deps: {
    requireAdmin: AdminMiddleware;
    requireAdminStepUp: AdminMiddleware;
  },
) {
  app.get(
    "/api/admin/foundry/status",
    deps.requireAdmin,
    deps.requireAdminStepUp,
    requireFoundryEnabled,
    async (_req, res) => {
      try {
        const payload = await collectFoundryGitStatus(process.cwd());
        res.json(payload);
      } catch (error) {
        res.status(500).json({
          message: "Failed to read git status",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  app.get(
    "/api/admin/foundry/runs",
    deps.requireAdmin,
    deps.requireAdminStepUp,
    requireFoundryEnabled,
    async (req, res) => {
      try {
        const raw = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
        const limit = Number.isFinite(raw) ? raw : 50;
        const rows = await listFoundryRunLogs(limit);
        res.json({
          runs: rows.map((r) => ({
            id: r.id,
            userId: r.userId,
            createdAt: r.createdAt,
            payload: r.payloadJson,
          })),
        });
      } catch {
        res.status(500).json({ message: "Failed to list Foundry runs" });
      }
    },
  );

  app.post(
    "/api/admin/foundry/runs",
    deps.requireAdmin,
    deps.requireAdminStepUp,
    requireFoundryEnabled,
    async (req, res) => {
      try {
        const body = appendRunSchema.parse(req.body ?? {});
        const row = await appendFoundryRunLog(req.user!.id, {
          branch: body.branch ?? undefined,
          commitSha: body.commitSha ?? undefined,
          dirtySummary: body.dirtySummary ?? undefined,
          checkOutcome: body.checkOutcome ?? undefined,
          testOutcome: body.testOutcome ?? undefined,
          note: body.note ?? undefined,
        });
        if (!row) return res.status(500).json({ message: "Failed to append run log" });
        res.status(201).json({
          id: row.id,
          createdAt: row.createdAt,
          payload: row.payloadJson,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: "Failed to append Foundry run" });
      }
    },
  );
}
