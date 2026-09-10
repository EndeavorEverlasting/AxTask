import { z } from "zod";
import type { Task } from "./schema";

/**
 * Public producer contract for durable domain ledgers that can be projected into AxTask.
 * The ledger owns domain truth; AxTask owns temporal projection and presentation.
 */
export const ACTIVITY_LEDGER_CONTRACT_VERSION = "ledger/v1" as const;

const temporalValueSchema = z
  .string()
  .min(10)
  .max(64)
  .refine((value) => /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value), {
    message: "Use an ISO date or ISO datetime",
  });

export const ledgerEvidenceSchema = z
  .object({
    label: z.string().min(1).max(160).optional(),
    url: z.string().url().max(2_048).optional(),
    ref: z.string().min(1).max(512).optional(),
  })
  .refine((value) => Boolean(value.url || value.ref), {
    message: "Evidence needs a url or ref",
  });

export const ledgerActivitySchema = z.object({
  schemaVersion: z.literal(ACTIVITY_LEDGER_CONTRACT_VERSION),
  entryId: z.string().min(1).max(256),
  sourceSystem: z.string().min(1).max(120),
  sourceLedger: z.string().min(1).max(240),
  title: z.string().min(1).max(500),
  status: z.enum(["planned", "in-progress", "completed", "cancelled", "observed"]),
  createdAt: temporalValueSchema,
  updatedAt: temporalValueSchema,
  occurredAt: temporalValueSchema.optional().nullable(),
  startedAt: temporalValueSchema.optional().nullable(),
  endedAt: temporalValueSchema.optional().nullable(),
  dueAt: temporalValueSchema.optional().nullable(),
  completedAt: temporalValueSchema.optional().nullable(),
  description: z.string().max(50_000).optional().nullable(),
  project: z.string().max(240).optional().nullable(),
  activityType: z.string().max(120).optional().nullable(),
  classification: z.string().max(120).optional().nullable(),
  sourceUrl: z.string().url().max(2_048).optional().nullable(),
  visibility: z.enum(["private", "public"]).default("private"),
  evidence: z.array(ledgerEvidenceSchema).max(20).default([]),
});

export type LedgerActivityInput = z.input<typeof ledgerActivitySchema>;
export type LedgerActivity = z.output<typeof ledgerActivitySchema>;
export type ActivityStatus = LedgerActivity["status"];
export type ActivityTemporalBasis =
  | "completed-at"
  | "occurred-at"
  | "started-at"
  | "due-at"
  | "updated-at"
  | "created-at"
  | "task-date";
export type ActivityTemporalConfidence = "observed" | "declared" | "recorded";

export type ActivityRecord = {
  activityKey: string;
  sourceSystem: string;
  sourceLedger: string;
  sourceEntryId: string;
  title: string;
  status: ActivityStatus;
  activityDate: string;
  anchorAt: string;
  temporalBasis: ActivityTemporalBasis;
  temporalConfidence: ActivityTemporalConfidence;
  project: string | null;
  activityType: string | null;
  classification: string | null;
  visibility: "private" | "public";
  sourceUrl: string | null;
  sourceUpdatedAt: string | null;
};

function normalizeIdentityPart(value: string): string {
  return value.trim().normalize("NFKC");
}

/**
 * Stable, lossless identity tuple. Persistence adapters may hash this string, but must
 * not include mutable prose such as title/description/status in identity generation.
 */
export function buildActivityKey(
  sourceSystem: string,
  sourceLedger: string,
  sourceEntryId: string,
): string {
  return JSON.stringify([
    normalizeIdentityPart(sourceSystem),
    normalizeIdentityPart(sourceLedger),
    normalizeIdentityPart(sourceEntryId),
  ]);
}

function datePart(value: string): string {
  const candidate = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    throw new Error(`Invalid temporal value: ${value}`);
  }
  const parsed = Date.parse(`${candidate}T00:00:00Z`);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid temporal value: ${value}`);
  }
  return candidate;
}

function chooseLedgerAnchor(entry: LedgerActivity): {
  anchorAt: string;
  temporalBasis: ActivityTemporalBasis;
  temporalConfidence: ActivityTemporalConfidence;
} {
  if (entry.completedAt) {
    return { anchorAt: entry.completedAt, temporalBasis: "completed-at", temporalConfidence: "observed" };
  }
  if (entry.occurredAt) {
    return { anchorAt: entry.occurredAt, temporalBasis: "occurred-at", temporalConfidence: "observed" };
  }
  if (entry.startedAt) {
    return { anchorAt: entry.startedAt, temporalBasis: "started-at", temporalConfidence: "declared" };
  }
  if (entry.dueAt) {
    return { anchorAt: entry.dueAt, temporalBasis: "due-at", temporalConfidence: "declared" };
  }
  if (entry.updatedAt) {
    return { anchorAt: entry.updatedAt, temporalBasis: "updated-at", temporalConfidence: "recorded" };
  }
  return { anchorAt: entry.createdAt, temporalBasis: "created-at", temporalConfidence: "recorded" };
}

export function normalizeLedgerActivity(input: LedgerActivityInput): ActivityRecord {
  const entry = ledgerActivitySchema.parse(input);
  const anchor = chooseLedgerAnchor(entry);
  return {
    activityKey: buildActivityKey(entry.sourceSystem, entry.sourceLedger, entry.entryId),
    sourceSystem: entry.sourceSystem,
    sourceLedger: entry.sourceLedger,
    sourceEntryId: entry.entryId,
    title: entry.title,
    status: entry.status,
    activityDate: datePart(anchor.anchorAt),
    anchorAt: anchor.anchorAt,
    temporalBasis: anchor.temporalBasis,
    temporalConfidence: anchor.temporalConfidence,
    project: entry.project ?? null,
    activityType: entry.activityType ?? null,
    classification: entry.classification ?? null,
    visibility: entry.visibility,
    sourceUrl: entry.sourceUrl ?? null,
    sourceUpdatedAt: entry.updatedAt,
  };
}

function taskStatus(status: Task["status"]): ActivityStatus {
  if (status === "completed") return "completed";
  if (status === "in-progress") return "in-progress";
  return "planned";
}

function taskAnchor(task: Task): string {
  if (task.startDate) return task.startDate;
  if (task.time) return `${task.date}T${task.time}`;
  return task.date;
}

/**
 * Compatibility projection for today's task model. `tasks.date` is a declared task date,
 * not an immutable completion event, so reports must surface this weaker temporal basis.
 */
export function projectTaskToActivity(task: Task): ActivityRecord {
  const anchorAt = taskAnchor(task);
  return {
    activityKey: buildActivityKey("axtask", "tasks", task.id),
    sourceSystem: "axtask",
    sourceLedger: "tasks",
    sourceEntryId: task.id,
    title: task.activity,
    status: taskStatus(task.status),
    activityDate: datePart(anchorAt),
    anchorAt,
    temporalBasis: "task-date",
    temporalConfidence: "declared",
    project: null,
    activityType: "task",
    classification: task.classification || null,
    visibility: task.visibility === "public" ? "public" : "private",
    sourceUrl: null,
    sourceUpdatedAt: task.updatedAt instanceof Date ? task.updatedAt.toISOString() : null,
  };
}
