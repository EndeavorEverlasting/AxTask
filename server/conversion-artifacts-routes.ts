import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "./auth";
import {
  createConversionArtifactBodySchema,
  undoConversionArtifactBodySchema,
} from "@shared/schema";
import { tryCappedCoinAward, ENGAGEMENT } from "./engagement-rewards";
import { getOrCreateWallet, getTaskAttachmentIdsForTasks, spendCoins } from "./storage";
import { toPublicConversionArtifact, toPublicTaskListItems } from "@shared/public-client-dtos";
import { getProductivityExportPricesForUser, priceForKind } from "./productivity-export-pricing";
import {
  createConversionArtifactWithTasks,
  getConversionArtifactWithTasks,
  listConversionArtifactsForUser,
  listConversionBundleLinksForUser,
  findArtifactForTask,
  softUndoConversionArtifact,
  hardUndoConversionArtifact,
  updateConversionArtifactTitle,
  setConversionArtifactEncrypted,
} from "./conversion-artifacts-storage";
import {
  buildConversionBundleCsv,
  buildConversionBundleMarkdown,
  generateConversionBundlePdf,
} from "./conversion-bundle-export";

const patchArtifactSchema = z.object({ title: z.string().min(1).max(200) });

const exportBodySchema = z.object({ format: z.enum(["md", "pdf", "csv"]) });

const encryptBodySchema = z.object({ enabled: z.boolean() });

async function spendForEncryptVault(userId: string, res: Response): Promise<boolean> {
  const prices = await getProductivityExportPricesForUser(userId);
  const required = priceForKind(prices, "conversionBundleExport");
  if (!prices.freeInDev && required > 0) {
    const w = await spendCoins(userId, required, "conversion_bundle:encrypt_at_rest");
    if (!w) {
      const bal = await getOrCreateWallet(userId);
      res.status(402).json({
        code: "INSUFFICIENT_COINS",
        required,
        balance: bal.balance,
        message: "Not enough AxCoins to enable encrypted vault.",
      });
      return false;
    }
  }
  return true;
}

async function spendForBundleExport(
  userId: string,
  kind: "md" | "pdf" | "csv",
  res: Response,
): Promise<boolean> {
  const prices = await getProductivityExportPricesForUser(userId);
  const required = priceForKind(prices, "conversionBundleExport");
  const spendReason =
    kind === "md"
      ? "productivity_export:conversion_bundle_md"
      : kind === "pdf"
        ? "productivity_export:conversion_bundle_pdf"
        : "productivity_export:conversion_bundle_csv";
  if (!prices.freeInDev && required > 0) {
    const w = await spendCoins(userId, required, spendReason);
    if (!w) {
      const bal = await getOrCreateWallet(userId);
      res.status(402).json({
        code: "INSUFFICIENT_COINS",
        required,
        balance: bal.balance,
        message: "Not enough AxCoins for this export.",
      });
      return false;
    }
  }
  return true;
}

export function attachConversionArtifactRoutes(app: Express): void {
  app.post("/api/conversion-artifacts", requireAuth, async (req: Request, res: Response) => {
    const parsed = createConversionArtifactBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid body", issues: parsed.error.flatten() });
    }
    try {
      const userId = req.user!.id;
      const { artifact, tasks } = await createConversionArtifactWithTasks(userId, parsed.data);
      const reward = await tryCappedCoinAward({
        userId,
        reason: ENGAGEMENT.uniqueTaskCreate.reason,
        amount: ENGAGEMENT.uniqueTaskCreate.amount,
        dailyCap: ENGAGEMENT.uniqueTaskCreate.dailyCap,
        details: "conversion artifact bundle",
      });
      const byTask = await getTaskAttachmentIdsForTasks(
        userId,
        tasks.map((t) => t.id),
      );
      res.status(201).json({
        artifact: toPublicConversionArtifact(artifact),
        tasks: toPublicTaskListItems(tasks, byTask),
        uniqueTaskReward: reward,
      });
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status;
      if (status === 413) return res.status(413).json({ message: (e as Error).message });
      console.error(e);
      res.status(500).json({ message: "Failed to create bundle" });
    }
  });

  app.get("/api/conversion-artifacts/bundle-links", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const links = await listConversionBundleLinksForUser(userId);
      res.json({ links });
    } catch {
      res.status(500).json({ message: "Failed to load bundle links" });
    }
  });

  app.get("/api/conversion-artifacts", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const taskId = typeof req.query.taskId === "string" ? req.query.taskId : "";
      if (taskId) {
        const hit = await findArtifactForTask(userId, taskId);
        if (!hit) return res.status(404).json({ message: "Not found" });
        return res.json(hit);
      }
      const rows = await listConversionArtifactsForUser(userId);
      res.json(
        rows.map((r) =>
          toPublicConversionArtifact(r, {
            totalChildren: r.totalChildren,
            completedChildren: r.completedChildren,
          }),
        ),
      );
    } catch {
      res.status(500).json({ message: "Failed to list bundles" });
    }
  });

  app.get("/api/conversion-artifacts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const bundle = await getConversionArtifactWithTasks(userId, id);
      if (!bundle) return res.status(404).json({ message: "Not found" });
      const byTask = await getTaskAttachmentIdsForTasks(
        userId,
        bundle.tasks.map((t) => t.id),
      );
      const stats = {
        totalChildren: bundle.tasks.length,
        completedChildren: bundle.tasks.filter((t) => t.status === "completed").length,
      };
      res.json({
        artifact: toPublicConversionArtifact(bundle.artifact, stats),
        tasks: toPublicTaskListItems(bundle.tasks, byTask),
      });
    } catch {
      res.status(500).json({ message: "Failed to load bundle" });
    }
  });

  app.patch("/api/conversion-artifacts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const parsed = patchArtifactSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid body" });
      const row = await updateConversionArtifactTitle(userId, id, parsed.data.title);
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json({ artifact: toPublicConversionArtifact(row) });
    } catch {
      res.status(500).json({ message: "Failed to update bundle" });
    }
  });

  app.post("/api/conversion-artifacts/:id/undo", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const parsed = undoConversionArtifactBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "mode must be soft or hard" });
      if (parsed.data.mode === "soft") {
        const r = await softUndoConversionArtifact(userId, id);
        if (!r) return res.status(404).json({ message: "Not found" });
        return res.json(r);
      }
      const ok = await hardUndoConversionArtifact(userId, id);
      if (!ok) return res.status(404).json({ message: "Not found" });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: "Failed to undo bundle" });
    }
  });

  app.post("/api/conversion-artifacts/:id/export", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const parsed = exportBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "format must be md, pdf, or csv" });
      const bundle = await getConversionArtifactWithTasks(userId, id);
      if (!bundle) return res.status(404).json({ message: "Not found" });
      if (!(await spendForBundleExport(userId, parsed.data.format, res))) return;

      const day = new Date().toISOString().split("T")[0];
      const safe = bundle.artifact.title.replace(/[^\w\-]+/g, "_").slice(0, 40) || "bundle";

      if (parsed.data.format === "md") {
        const md = buildConversionBundleMarkdown(bundle.artifact, bundle.tasks);
        res.setHeader("Content-Type", "text/markdown; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="axtask-bundle-${safe}-${day}.md"`,
        );
        res.send(Buffer.from(md, "utf8"));
        return;
      }
      if (parsed.data.format === "csv") {
        const csv = buildConversionBundleCsv(bundle.tasks);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="axtask-bundle-${safe}-${day}.csv"`,
        );
        res.send(Buffer.from(csv, "utf8"));
        return;
      }
      const pdfDoc = generateConversionBundlePdf(bundle.artifact, bundle.tasks);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="axtask-bundle-${safe}-${day}.pdf"`,
      );
      pdfDoc.pipe(res);
      pdfDoc.end();
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Export failed" });
    }
  });

  app.post("/api/conversion-artifacts/:id/encrypt", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const parsed = encryptBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "enabled boolean required" });
      if (parsed.data.enabled) {
        if (!(await spendForEncryptVault(userId, res))) return;
      }
      const row = await setConversionArtifactEncrypted(userId, id, parsed.data.enabled);
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json({ artifact: toPublicConversionArtifact(row) });
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status;
      if (status === 503) return res.status(503).json({ message: (e as Error).message });
      res.status(500).json({ message: "Failed to update encryption" });
    }
  });

  app.post("/api/conversion-artifacts/:id/re-plan", requireAuth, async (req: Request, res: Response) => {
    void req.body;
    const userId = req.user!.id;
    const bundle = await getConversionArtifactWithTasks(userId, req.params.id);
    if (!bundle) return res.status(404).json({ message: "Not found" });
    res.status(501).json({ message: "AI re-plan is not available yet." });
  });

  app.post("/api/conversion-artifacts/:id/convert-to-gantt", requireAuth, async (req: Request, res: Response) => {
    void req.body;
    const userId = req.user!.id;
    const bundle = await getConversionArtifactWithTasks(userId, req.params.id);
    if (!bundle) return res.status(404).json({ message: "Not found" });
    res.status(501).json({ message: "Convert to Gantt is not available yet." });
  });
}
