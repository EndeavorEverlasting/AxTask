import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { PublicDmConversation, PublicDmMessage } from "@shared/public-client-dtos";
import { getUserRowById } from "../storage";
import {
  assertEligibleForPublicParticipation,
  PublicParticipationAgeError,
} from "../lib/public-participation-age";
import {
  upsertUserDeviceKey,
  listUserDeviceKeysPublic,
  assertDmMember,
  getOtherMemberUserId,
  createDirectDmConversation,
  listDmConversationsForUser,
  listDmMessages,
  insertDmMessage,
  resolvePeerUserIdByPublicIdentifier,
  getPublicDmSharePack,
} from "../dm-e2ee";

type RequireAuthMiddleware = (req: Request, res: Response, next: NextFunction) => unknown;

export function registerDmE2eeRoutes(app: Express, requireAuth: RequireAuthMiddleware) {
  app.post("/api/e2ee/devices", requireAuth, async (req, res) => {
    try {
      const body = z
        .object({
          deviceId: z.string().min(8).max(160),
          publicKeySpki: z.string().min(32).max(20000),
          label: z.string().max(120).optional().nullable(),
        })
        .parse(req.body);
      await upsertUserDeviceKey({
        userId: req.user!.id,
        deviceId: body.deviceId,
        publicKeySpki: body.publicKeySpki,
        label: body.label ?? null,
      });
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to register device key" });
    }
  });

  app.get("/api/e2ee/devices", requireAuth, async (req, res) => {
    try {
      const devices = await listUserDeviceKeysPublic(req.user!.id);
      res.json({ devices });
    } catch {
      res.status(500).json({ message: "Failed to list devices" });
    }
  });

  app.get("/api/e2ee/conversations/:id/peer-devices", requireAuth, async (req, res) => {
    try {
      const ok = await assertDmMember(req.params.id, req.user!.id);
      if (!ok) return res.status(404).json({ message: "Not found" });
      const peerUserId = await getOtherMemberUserId(req.params.id, req.user!.id);
      if (!peerUserId) return res.status(400).json({ message: "Invalid conversation" });
      const devices = await listUserDeviceKeysPublic(peerUserId);
      res.json({ devices });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to list peer devices" });
    }
  });

  app.get("/api/dm/public-identity", requireAuth, async (req, res) => {
    try {
      const share = await getPublicDmSharePack(req.user!.id);
      if (!share) return res.status(404).json({ message: "User not found" });
      res.json({
        publicHandle: share.publicHandle,
        publicDmToken: share.publicDmToken,
      });
    } catch {
      res.status(500).json({ message: "Failed to load DM identity" });
    }
  });

  app.post("/api/dm/conversations", requireAuth, async (req, res) => {
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
      const parsed = z
        .object({
          peerHandle: z.string().min(2).max(64).optional(),
          peerDmToken: z.string().min(16).max(128).optional(),
        })
        .refine((v) => Boolean(v.peerHandle?.trim() || v.peerDmToken?.trim()), {
          message: "Provide a peer handle or invite token",
        })
        .parse(req.body);
      const peerUserId = await resolvePeerUserIdByPublicIdentifier({
        peerHandle: parsed.peerHandle ?? null,
        peerDmToken: parsed.peerDmToken ?? null,
      });
      if (!peerUserId) return res.status(404).json({ message: "Peer not found" });
      if (peerUserId === req.user!.id) {
        return res.status(400).json({ message: "Cannot start a conversation with yourself" });
      }
      const conversationId = await createDirectDmConversation(req.user!.id, peerUserId);
      res.status(201).json({ conversationId });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  app.get("/api/dm/conversations", requireAuth, async (req, res) => {
    try {
      const conversations = await listDmConversationsForUser(req.user!.id) as PublicDmConversation[];
      res.json({ conversations });
    } catch {
      res.status(500).json({ message: "Failed to list conversations" });
    }
  });

  app.get("/api/dm/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const ok = await assertDmMember(req.params.id, req.user!.id);
      if (!ok) return res.status(404).json({ message: "Not found" });
      const rows = await listDmMessages(req.params.id, 200);
      const messages: PublicDmMessage[] = [...rows].reverse().map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        direction: m.senderUserId === req.user!.id ? "out" : "in",
        senderPubSpkiB64: m.senderPubSpkiB64,
        recipientPubSpkiB64: m.recipientPubSpkiB64,
        ciphertextB64: m.ciphertextB64,
        nonceB64: m.nonceB64,
        contentEncoding: m.contentEncoding,
        createdAt: m.createdAt ? m.createdAt.toISOString() : null,
      }));
      res.json({ messages });
    } catch {
      res.status(500).json({ message: "Failed to load messages" });
    }
  });

  app.post("/api/dm/conversations/:id/messages", requireAuth, async (req, res) => {
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
      const DM_B64_FIELD_MAX = 512 * 1024;
      const parsed = z
        .object({
          ciphertextB64: z.string().min(1).max(DM_B64_FIELD_MAX),
          nonceB64: z.string().min(1).max(256),
          senderPubSpkiB64: z.string().min(1).max(DM_B64_FIELD_MAX),
          recipientPubSpkiB64: z.string().min(1).max(DM_B64_FIELD_MAX),
          contentEncoding: z.string().max(32).optional(),
        })
        .parse(req.body);
      const ok = await assertDmMember(req.params.id, req.user!.id);
      if (!ok) return res.status(404).json({ message: "Not found" });
      const recipientUserId = await getOtherMemberUserId(req.params.id, req.user!.id);
      if (!recipientUserId) return res.status(400).json({ message: "Invalid conversation" });
      const row = await insertDmMessage({
        conversationId: req.params.id,
        senderUserId: req.user!.id,
        recipientUserId,
        senderPubSpkiB64: parsed.senderPubSpkiB64,
        recipientPubSpkiB64: parsed.recipientPubSpkiB64,
        ciphertextB64: parsed.ciphertextB64,
        nonceB64: parsed.nonceB64,
        contentEncoding: parsed.contentEncoding,
      });
      res.status(201).json({
        id: row.id,
        conversationId: row.conversationId,
        direction: "out",
        senderPubSpkiB64: row.senderPubSpkiB64,
        recipientPubSpkiB64: row.recipientPubSpkiB64,
        ciphertextB64: row.ciphertextB64,
        nonceB64: row.nonceB64,
        contentEncoding: row.contentEncoding,
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      } satisfies PublicDmMessage);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.message });
      if (error instanceof Error) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to send message" });
    }
  });
}
