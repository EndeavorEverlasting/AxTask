import { db } from "../db";
import { and, eq } from "drizzle-orm";
import { aiInteractions } from "@shared/schema";

export async function logAiInteraction(input: typeof aiInteractions.$inferInsert) {
  const [row] = await db.insert(aiInteractions).values(input).returning();
  return row!;
}

export async function markAiInteractionAccepted(id: string, userId: string) {
  const [row] = await db
    .update(aiInteractions)
    .set({ accepted: true, rejectedReason: null })
    .where(and(eq(aiInteractions.id, id), eq(aiInteractions.userId, userId)))
    .returning();
  return row ?? null;
}

export async function markAiInteractionRejected(id: string, userId: string, reason: string) {
  const [row] = await db
    .update(aiInteractions)
    .set({ accepted: false, rejectedReason: reason })
    .where(and(eq(aiInteractions.id, id), eq(aiInteractions.userId, userId)))
    .returning();
  return row ?? null;
}
