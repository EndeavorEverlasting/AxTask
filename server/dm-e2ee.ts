import { randomUUID } from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  dmConversationMembers,
  dmConversations,
  dmMessages,
  userDeviceKeys,
} from "@shared/schema";

export async function upsertUserDeviceKey(input: {
  userId: string;
  deviceId: string;
  publicKeySpki: string;
  label?: string | null;
}): Promise<void> {
  const now = new Date();
  const [existing] = await db
    .select({ id: userDeviceKeys.id })
    .from(userDeviceKeys)
    .where(and(eq(userDeviceKeys.userId, input.userId), eq(userDeviceKeys.deviceId, input.deviceId)))
    .limit(1);

  if (existing) {
    await db
      .update(userDeviceKeys)
      .set({
        publicKeySpki: input.publicKeySpki,
        label: input.label ?? null,
        lastSeenAt: now,
      })
      .where(eq(userDeviceKeys.id, existing.id));
    return;
  }

  await db.insert(userDeviceKeys).values({
    id: randomUUID(),
    userId: input.userId,
    deviceId: input.deviceId,
    publicKeySpki: input.publicKeySpki,
    label: input.label ?? null,
    createdAt: now,
    lastSeenAt: now,
  });
}

export async function listUserDeviceKeysPublic(userId: string) {
  return db
    .select({
      deviceId: userDeviceKeys.deviceId,
      publicKeySpki: userDeviceKeys.publicKeySpki,
      label: userDeviceKeys.label,
      createdAt: userDeviceKeys.createdAt,
    })
    .from(userDeviceKeys)
    .where(eq(userDeviceKeys.userId, userId))
    .orderBy(desc(userDeviceKeys.lastSeenAt));
}

export async function findDirectDmConversationId(
  userId: string,
  peerUserId: string,
): Promise<string | null> {
  const mine = await db
    .select({ conversationId: dmConversationMembers.conversationId })
    .from(dmConversationMembers)
    .where(eq(dmConversationMembers.userId, userId));

  if (mine.length === 0) return null;

  const ids = [...new Set(mine.map((m) => m.conversationId))];
  for (const conversationId of ids) {
    const members = await db
      .select({ userId: dmConversationMembers.userId })
      .from(dmConversationMembers)
      .where(eq(dmConversationMembers.conversationId, conversationId));
    if (members.length !== 2) continue;
    const set = new Set(members.map((m) => m.userId));
    if (set.has(userId) && set.has(peerUserId)) return conversationId;
  }
  return null;
}

export async function createDirectDmConversation(userId: string, peerUserId: string): Promise<string> {
  const existing = await findDirectDmConversationId(userId, peerUserId);
  if (existing) return existing;

  const id = randomUUID();
  await db.insert(dmConversations).values({ id });
  await db.insert(dmConversationMembers).values([
    { conversationId: id, userId },
    { conversationId: id, userId: peerUserId },
  ]);
  return id;
}

export async function getOtherMemberUserId(
  conversationId: string,
  userId: string,
): Promise<string | null> {
  const members = await db
    .select({ userId: dmConversationMembers.userId })
    .from(dmConversationMembers)
    .where(eq(dmConversationMembers.conversationId, conversationId));
  if (members.length !== 2) return null;
  return members.find((m) => m.userId !== userId)?.userId ?? null;
}

export async function assertDmMember(conversationId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ one: dmConversationMembers.userId })
    .from(dmConversationMembers)
    .where(
      and(eq(dmConversationMembers.conversationId, conversationId), eq(dmConversationMembers.userId, userId)),
    )
    .limit(1);
  return Boolean(row);
}

export async function listDmConversationsForUser(userId: string) {
  const mine = await db
    .select({ conversationId: dmConversationMembers.conversationId })
    .from(dmConversationMembers)
    .where(eq(dmConversationMembers.userId, userId));

  const ids = [...new Set(mine.map((m) => m.conversationId))];
  if (ids.length === 0) return [];

  const members = await db
    .select()
    .from(dmConversationMembers)
    .where(inArray(dmConversationMembers.conversationId, ids));

  const byConv = new Map<string, string[]>();
  for (const m of members) {
    const arr = byConv.get(m.conversationId) ?? [];
    arr.push(m.userId);
    byConv.set(m.conversationId, arr);
  }

  return ids.map((id) => ({
    id,
    peerUserId: (byConv.get(id) ?? []).find((u) => u !== userId) ?? null,
    memberUserIds: byConv.get(id) ?? [],
  }));
}

export async function insertDmMessage(input: {
  conversationId: string;
  senderUserId: string;
  recipientUserId: string;
  senderPubSpkiB64: string;
  ciphertextB64: string;
  nonceB64: string;
  contentEncoding?: string;
}) {
  const [row] = await db
    .insert(dmMessages)
    .values({
      id: randomUUID(),
      conversationId: input.conversationId,
      senderUserId: input.senderUserId,
      recipientUserId: input.recipientUserId,
      senderPubSpkiB64: input.senderPubSpkiB64,
      ciphertextB64: input.ciphertextB64,
      nonceB64: input.nonceB64,
      contentEncoding: input.contentEncoding ?? "e2ee_ecdh_aes_gcm_v1",
    })
    .returning();
  return row;
}

export async function listDmMessages(conversationId: string, limit = 100) {
  return db
    .select()
    .from(dmMessages)
    .where(eq(dmMessages.conversationId, conversationId))
    .orderBy(desc(dmMessages.createdAt))
    .limit(limit);
}
