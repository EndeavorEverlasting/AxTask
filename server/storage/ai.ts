import { db } from "../db";
import { and, eq } from "drizzle-orm";
import { aiInteractions } from "@shared/schema";

export async function logAiInteraction(input: {
  userId: string;
  sessionId?: string | null;
  rawMessage: string;
  intentKind?: string | null;
  structuredOutputJson?: unknown;
  provider?: string | null;
  model?: string | null;
  latencyMs?: number | null;
}) {
  const [row] = await db
    .insert(aiInteractions)
    .values({
      userId: input.userId,
      sessionId: input.sessionId ?? null,
      rawMessage: input.rawMessage,
      intentKind: input.intentKind ?? null,
      structuredOutputJson: input.structuredOutputJson ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      latencyMs: input.latencyMs ?? null,
    })
    .returning();
  return row ?? null;
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
