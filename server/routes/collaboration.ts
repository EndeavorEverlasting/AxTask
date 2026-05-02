import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { toPublicAttachmentRefs } from "@shared/public-client-dtos";
import {
  listCollaborationInbox,
  getAttachmentsForOwnersBatch,
  appendCollaborationMessage,
  markCollaborationMessageRead,
  linkAttachmentsToOwner,
  getUserRowById,
} from "../storage";
import {
  assertEligibleForPublicParticipation,
  PublicParticipationAgeError,
} from "../lib/public-participation-age";

type RequireAuthMiddleware = (req: Request, res: Response, next: NextFunction) => unknown;

const collabBodySchema = z.object({
  body: z.string().min(1).max(10_000),
  taskId: z.string().uuid().optional(),
  attachmentAssetIds: z.array(z.string().min(1)).max(8).default([]),
});

export function registerCollaborationRoutes(app: Express, requireAuth: RequireAuthMiddleware) {
  app.get("/api/collaboration/inbox", requireAuth, async (req, res) => {
    try {
      const rows = await listCollaborationInbox(req.user!.id);
      // Single batched query instead of one per row (N+1 fix, Phase E).
      const assetsByOwner = await getAttachmentsForOwnersBatch({
        userId: req.user!.id,
        ownerType: "collab_message",
        ownerIds: rows.map((r) => r.id),
      });
      const decorated = rows.map((row) => ({
        ...row,
        attachments: toPublicAttachmentRefs(assetsByOwner.get(row.id) ?? []),
      }));
      res.json({ messages: decorated });
    } catch (error) {
      res.status(500).json({ message: "Failed to load collaboration inbox" });
    }
  });

  app.post("/api/collaboration/inbox", requireAuth, async (req, res) => {
    try {
      const userRow = await getUserRowById(req.user!.id);
      try {
        assertEligibleForPublicParticipation(userRow?.birthDate ?? null);
      } catch (e: unknown) {
        if (e instanceof PublicParticipationAgeError) {
          return res.status(e.statusCode).json({ message: e.message, code: e.code });
        }
        throw e;
      }

      const body = collabBodySchema.parse(req.body || {});
      const row = await appendCollaborationMessage({
        userId: req.user!.id,
        body: body.body,
        taskId: body.taskId ?? null,
        senderUserId: req.user!.id,
      });
      const assets = await linkAttachmentsToOwner({
        userId: req.user!.id,
        ownerType: "collab_message",
        ownerId: row.id,
        assetIds: body.attachmentAssetIds,
      });
      res.status(201).json({ ...row, attachments: toPublicAttachmentRefs(assets) });
    } catch (error) {
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to append message" });
    }
  });

  app.post("/api/collaboration/inbox/:id/read", requireAuth, async (req, res) => {
    try {
      const ok = await markCollaborationMessageRead(req.user!.id, req.params.id);
      if (!ok) return res.status(404).json({ message: "Message not found" });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark read" });
    }
  });
}
