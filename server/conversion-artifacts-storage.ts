import { randomUUID } from "crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import {
  conversionArtifactTasks,
  conversionArtifacts,
  tasks,
  type ConversionArtifact,
  type Task,
} from "@shared/schema";
import type { z } from "zod";
import {
  conversionArtifactItemSchema,
  createConversionArtifactBodySchema,
} from "@shared/schema";
import { assertCanCreateTasks } from "./storage";
import { topoSortKeyedItems } from "@shared/dependency-graph";
import { openConversionPayload, sealConversionPayload } from "./conversion-artifact-crypto";

export type CreateConversionArtifactBody = z.infer<typeof createConversionArtifactBodySchema>;
export type ConversionArtifactItemInput = z.infer<typeof conversionArtifactItemSchema>;

type EnrichedItem = ConversionArtifactItemInput & { key: string };

function orderItemsForInsert(items: ConversionArtifactItemInput[]): EnrichedItem[] {
  const enriched: EnrichedItem[] = items.map((it, idx) => ({
    ...it,
    key: it.key ?? `__auto_${idx}`,
  }));
  const anyDeps = enriched.some((i) => (i.dependsOnKeys?.length ?? 0) > 0);
  if (!anyDeps) return enriched;
  return topoSortKeyedItems(enriched);
}

export async function createConversionArtifactWithTasks(
  userId: string,
  input: CreateConversionArtifactBody,
): Promise<{ artifact: ConversionArtifact; tasks: Task[] }> {
  const quota = await assertCanCreateTasks(userId, input.items.length);
  if (!quota.ok) {
    const err = new Error(quota.message ?? "Task limit reached");
    (err as Error & { status?: number }).status = 413;
    throw err;
  }

  const defaults = input.taskDefaults ?? {};
  const baseDate =
    defaults.date ??
    new Date().toISOString().slice(0, 10);
  const title =
    input.title?.trim() ||
    (input.items[0]?.activity ? input.items[0].activity.slice(0, 120) : "Task bundle");

  const ordered = orderItemsForInsert(input.items);
  const now = new Date();
  const artifactId = randomUUID();

  return db.transaction(async (tx) => {
    const [artifact] = await tx
      .insert(conversionArtifacts)
      .values({
        id: artifactId,
        userId,
        title,
        conversionType: input.conversionType,
        originalActivity: input.originalActivity ?? "",
        originalNotes: input.originalNotes ?? "",
        encrypted: false,
        encryptedPayload: null,
        encryptionKeyRef: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const keyToId = new Map<string, string>();
    const insertedTasks: Task[] = [];
    let sortOrder = 0;

    for (const item of ordered) {
      const fromKeys = (item.dependsOnKeys ?? []).map((k) => {
        const id = keyToId.get(k);
        if (!id) throw new Error(`Unresolved dependency key: ${k}`);
        return id;
      });
      const direct = (item.dependsOn ?? []).filter(Boolean);
      const dependsOn = [...new Set([...direct, ...fromKeys])].slice(0, 32);

      const taskId = randomUUID();
      const row = {
        id: taskId,
        userId,
        date: item.startDate?.trim() || baseDate,
        time: defaults.time ?? "",
        activity: item.activity.trim(),
        notes: (item.notes ?? "").trim(),
        urgency: defaults.urgency ?? null,
        impact: defaults.impact ?? null,
        effort: defaults.effort ?? null,
        prerequisites: "",
        recurrence: "none" as const,
        priority: "Low",
        priorityScore: 0,
        classification: (item.classification?.trim() || "General") as string,
        classificationAssociations: null,
        status: "pending" as const,
        isRepeated: false,
        sortOrder: 0,
        visibility: (defaults.visibility ?? "private") as "private" | "public",
        communityShowNotes: defaults.communityShowNotes ?? false,
        startDate: item.startDate?.trim() || null,
        endDate: item.endDate?.trim() || null,
        durationMinutes: item.durationMinutes ?? null,
        dependsOn: dependsOn.length ? dependsOn : null,
        deadlineType: item.deadlineType ?? null,
        createdAt: now,
        updatedAt: now,
      };

      const [task] = await tx.insert(tasks).values(row).returning();
      insertedTasks.push(task!);

      await tx.insert(conversionArtifactTasks).values({
        id: randomUUID(),
        artifactId: artifact!.id,
        taskId: task!.id,
        sortOrder,
      });
      sortOrder += 1;
      keyToId.set(item.key, task!.id);
    }

    return { artifact: artifact!, tasks: insertedTasks };
  });
}

export async function getConversionArtifactRow(
  userId: string,
  artifactId: string,
): Promise<ConversionArtifact | undefined> {
  const [row] = await db
    .select()
    .from(conversionArtifacts)
    .where(and(eq(conversionArtifacts.id, artifactId), eq(conversionArtifacts.userId, userId)));
  return row;
}

export async function listTaskIdsForArtifact(artifactId: string): Promise<string[]> {
  const rows = await db
    .select({ taskId: conversionArtifactTasks.taskId })
    .from(conversionArtifactTasks)
    .where(eq(conversionArtifactTasks.artifactId, artifactId))
    .orderBy(asc(conversionArtifactTasks.sortOrder));
  return rows.map((r) => r.taskId);
}

export async function getConversionArtifactWithTasks(
  userId: string,
  artifactId: string,
): Promise<{ artifact: ConversionArtifact; tasks: Task[] } | undefined> {
  const artifact = await getConversionArtifactRow(userId, artifactId);
  if (!artifact) return undefined;

  let a = artifact;
  if (artifact.encrypted && artifact.encryptedPayload) {
    const buf = artifact.encryptedPayload;
    const json = openConversionPayload(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
    if (json) {
      try {
        const parsed = JSON.parse(json) as { originalActivity?: string; originalNotes?: string };
        a = {
          ...artifact,
          originalActivity: parsed.originalActivity ?? "",
          originalNotes: parsed.originalNotes ?? "",
        };
      } catch {
        /* keep encrypted shell */
      }
    }
  }

  const ids = await listTaskIdsForArtifact(artifactId);
  if (ids.length === 0) return { artifact: a, tasks: [] };
  const taskRows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), inArray(tasks.id, ids), isNull(tasks.deletedAt)));
  const order = new Map(ids.map((id, i) => [id, i]));
  taskRows.sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0));
  return { artifact: a, tasks: taskRows };
}

export async function listConversionBundleLinksForUser(
  userId: string,
): Promise<{ taskId: string; artifactId: string; title: string }[]> {
  return db
    .select({
      taskId: conversionArtifactTasks.taskId,
      artifactId: conversionArtifacts.id,
      title: conversionArtifacts.title,
    })
    .from(conversionArtifactTasks)
    .innerJoin(conversionArtifacts, eq(conversionArtifacts.id, conversionArtifactTasks.artifactId))
    .where(eq(conversionArtifacts.userId, userId));
}

export async function findArtifactForTask(
  userId: string,
  taskId: string,
): Promise<{ artifactId: string; title: string } | undefined> {
  const [row] = await db
    .select({
      artifactId: conversionArtifacts.id,
      title: conversionArtifacts.title,
    })
    .from(conversionArtifactTasks)
    .innerJoin(conversionArtifacts, eq(conversionArtifacts.id, conversionArtifactTasks.artifactId))
    .where(
      and(eq(conversionArtifactTasks.taskId, taskId), eq(conversionArtifacts.userId, userId)),
    )
    .limit(1);
  if (!row) return undefined;
  return row;
}

export type ConversionArtifactListRow = ConversionArtifact & {
  totalChildren: number;
  completedChildren: number;
};

export async function listConversionArtifactsForUser(userId: string): Promise<ConversionArtifactListRow[]> {
  const arts = await db
    .select()
    .from(conversionArtifacts)
    .where(eq(conversionArtifacts.userId, userId))
    .orderBy(desc(conversionArtifacts.updatedAt));

  const out: ConversionArtifactListRow[] = [];
  for (const art of arts) {
    const ids = await listTaskIdsForArtifact(art.id);
    if (ids.length === 0) {
      out.push({ ...art, totalChildren: 0, completedChildren: 0 });
      continue;
    }
    const stats = await db
      .select({
        total: sql<number>`count(*)::int`,
        done: sql<number>`sum(case when ${tasks.status} = 'completed' then 1 else 0 end)::int`,
      })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), inArray(tasks.id, ids), isNull(tasks.deletedAt)));
    const total = Number(stats[0]?.total) || 0;
    const done = Number(stats[0]?.done) || 0;
    out.push({ ...art, totalChildren: total, completedChildren: done });
  }
  return out;
}

export async function updateConversionArtifactTitle(
  userId: string,
  artifactId: string,
  title: string,
): Promise<ConversionArtifact | undefined> {
  const [row] = await db
    .update(conversionArtifacts)
    .set({ title: title.trim(), updatedAt: new Date() })
    .where(and(eq(conversionArtifacts.id, artifactId), eq(conversionArtifacts.userId, userId)))
    .returning();
  return row;
}

export async function softUndoConversionArtifact(
  userId: string,
  artifactId: string,
): Promise<{ restoredDraft: { activity: string; notes: string } } | undefined> {
  const artifact = await getConversionArtifactRow(userId, artifactId);
  if (!artifact) return undefined;
  let activity = artifact.originalActivity;
  let notes = artifact.originalNotes;
  if (artifact.encrypted && artifact.encryptedPayload) {
    const buf = artifact.encryptedPayload;
    const json = openConversionPayload(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
    if (json) {
      try {
        const parsed = JSON.parse(json) as { originalActivity?: string; originalNotes?: string };
        activity = parsed.originalActivity ?? activity;
        notes = parsed.originalNotes ?? notes;
      } catch {
        /* noop */
      }
    }
  }
  const taskIds = await listTaskIdsForArtifact(artifactId);
  await db.transaction(async (tx) => {
    if (taskIds.length) {
      await tx.delete(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.id, taskIds)));
    }
    await tx.delete(conversionArtifacts).where(eq(conversionArtifacts.id, artifactId));
  });
  return { restoredDraft: { activity, notes } };
}

export async function hardUndoConversionArtifact(userId: string, artifactId: string): Promise<boolean> {
  const r = await softUndoConversionArtifact(userId, artifactId);
  return Boolean(r);
}

export async function setConversionArtifactEncrypted(
  userId: string,
  artifactId: string,
  encrypt: boolean,
): Promise<ConversionArtifact | undefined> {
  const artifact = await getConversionArtifactRow(userId, artifactId);
  if (!artifact) return undefined;

  if (!encrypt) {
    const [row] = await db
      .update(conversionArtifacts)
      .set({
        encrypted: false,
        encryptedPayload: null,
        encryptionKeyRef: null,
        updatedAt: new Date(),
      })
      .where(and(eq(conversionArtifacts.id, artifactId), eq(conversionArtifacts.userId, userId)))
      .returning();
    return row;
  }

  const payload = JSON.stringify({
    originalActivity: artifact.originalActivity,
    originalNotes: artifact.originalNotes,
  });
  const sealed = sealConversionPayload(payload);
  if (!sealed) {
    const err = new Error("Server encryption is not configured");
    (err as Error & { status?: number }).status = 503;
    throw err;
  }

  const [row] = await db
    .update(conversionArtifacts)
    .set({
      encrypted: true,
      encryptedPayload: sealed.blob,
      encryptionKeyRef: sealed.keyRef,
      originalActivity: "",
      originalNotes: "",
      updatedAt: new Date(),
    })
    .where(and(eq(conversionArtifacts.id, artifactId), eq(conversionArtifacts.userId, userId)))
    .returning();
  return row;
}
