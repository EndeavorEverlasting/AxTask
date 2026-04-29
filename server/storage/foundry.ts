import { desc } from "drizzle-orm";
import { db } from "../db";
import { foundryRunLogs } from "@shared/schema";

export type FoundryRunPayload = {
  branch?: string | null;
  commitSha?: string | null;
  dirtySummary?: string | null;
  checkOutcome?: "pass" | "fail" | "skipped" | null;
  testOutcome?: "pass" | "fail" | "skipped" | null;
  note?: string | null;
};

export async function appendFoundryRunLog(userId: string, payload: FoundryRunPayload) {
  const [row] = await db
    .insert(foundryRunLogs)
    .values({
      userId,
      payloadJson: payload,
    })
    .returning();
  return row ?? null;
}

export async function listFoundryRunLogs(limit = 50) {
  const cap = Math.min(Math.max(1, limit), 200);
  return db.select().from(foundryRunLogs).orderBy(desc(foundryRunLogs.createdAt)).limit(cap);
}
