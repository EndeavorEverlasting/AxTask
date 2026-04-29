import { db } from "../db";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import {
  userReminders,
  userReminderTriggers,
  userLocationEvents,
  userLocationPlaces,
  type UserLocationEvent,
} from "@shared/schema";

/** Written to `user_location_events.metadata_json` after offset scheduling runs for this row. */
export const LOCATION_OFFSET_SCHEDULING_META_KEY = "locationOffsetSchedulingAppliedAt" as const;

function asMetadataRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

/** DB root or transaction client — both support the queries used by offset scheduling. */
type RemindersExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
type ReminderTriggerRow = typeof userReminderTriggers.$inferSelect;
type ReminderRow = typeof userReminders.$inferSelect;

export type DueReminderDispatchRow = {
  trigger: ReminderTriggerRow;
  reminder: ReminderRow;
};

export async function createReminderWithTrigger(input: {
  reminder: typeof userReminders.$inferInsert;
  trigger: Omit<typeof userReminderTriggers.$inferInsert, "reminderId">;
}) {
  return db.transaction(async (tx) => {
    const [reminder] = await tx.insert(userReminders).values(input.reminder).returning();
    const [trigger] = await tx
      .insert(userReminderTriggers)
      .values({
        ...input.trigger,
        reminderId: reminder.id,
      })
      .returning();
    return { reminder, trigger };
  });
}

export async function listUserReminders(userId: string) {
  return db
    .select()
    .from(userReminders)
    .where(eq(userReminders.userId, userId));
}

export async function getReminderById(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(userReminders)
    .where(and(eq(userReminders.id, id), eq(userReminders.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function updateReminder(
  id: string,
  userId: string,
  patch: Partial<Pick<typeof userReminders.$inferInsert, "title" | "body" | "enabled" | "kind">>,
) {
  const [row] = await db
    .update(userReminders)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(userReminders.id, id), eq(userReminders.userId, userId)))
    .returning();
  return row ?? null;
}

export async function disableReminder(id: string, userId: string) {
  const [row] = await db
    .update(userReminders)
    .set({ enabled: false, updatedAt: new Date() })
    .where(and(eq(userReminders.id, id), eq(userReminders.userId, userId)))
    .returning();
  return row ?? null;
}

export async function listDueReminderTriggers(now: Date) {
  const rows = await db
    .select({ t: userReminderTriggers })
    .from(userReminderTriggers)
    .innerJoin(userReminders, eq(userReminderTriggers.reminderId, userReminders.id))
    .where(
      and(
        eq(userReminders.enabled, true),
        eq(userReminderTriggers.isActive, true),
        isNotNull(userReminderTriggers.nextRunAt),
        lte(userReminderTriggers.nextRunAt, now),
      ),
    );
  return rows.map((r) => r.t);
}

export async function listDueReminderDispatchRows(
  now: Date,
  limit = 100,
): Promise<DueReminderDispatchRow[]> {
  const rows = await db
    .select({ trigger: userReminderTriggers, reminder: userReminders })
    .from(userReminderTriggers)
    .innerJoin(userReminders, eq(userReminderTriggers.reminderId, userReminders.id))
    .where(
      and(
        eq(userReminders.enabled, true),
        eq(userReminderTriggers.isActive, true),
        isNotNull(userReminderTriggers.nextRunAt),
        lte(userReminderTriggers.nextRunAt, now),
      ),
    )
    .limit(Math.max(1, limit));
  return rows;
}

export async function markReminderTriggered(triggerId: string, when: Date) {
  const [row] = await db
    .update(userReminderTriggers)
    .set({
      lastTriggeredAt: when,
      updatedAt: when,
      nextRunAt: null,
    })
    .where(eq(userReminderTriggers.id, triggerId))
    .returning();
  return row ?? null;
}

type ReminderRecurrence = {
  frequency?: "daily" | "weekly" | "monthly";
  interval?: number;
};

function normalizePositiveInterval(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(1, Math.trunc(value));
}

function getRecurrenceFromPayload(payloadJson: unknown): ReminderRecurrence | null {
  if (!payloadJson || typeof payloadJson !== "object" || Array.isArray(payloadJson)) return null;
  const rec = (payloadJson as { recurrence?: unknown }).recurrence;
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) return null;
  const typed = rec as ReminderRecurrence;
  if (!typed.frequency) return null;
  return {
    frequency: typed.frequency,
    interval: normalizePositiveInterval(typed.interval),
  };
}

export function computeNextRunAtFromRecurrence(payloadJson: unknown, from: Date): Date | null {
  const recurrence = getRecurrenceFromPayload(payloadJson);
  if (!recurrence?.frequency) return null;

  const next = new Date(from);
  const interval = recurrence.interval ?? 1;
  if (recurrence.frequency === "daily") {
    next.setUTCDate(next.getUTCDate() + interval);
    return next;
  }
  if (recurrence.frequency === "weekly") {
    next.setUTCDate(next.getUTCDate() + interval * 7);
    return next;
  }
  if (recurrence.frequency === "monthly") {
    next.setUTCMonth(next.getUTCMonth() + interval);
    return next;
  }
  return null;
}

export async function finalizeReminderTriggerDispatch(input: {
  triggerId: string;
  firedAt: Date;
  nextRunAt: Date | null;
}) {
  const [row] = await db
    .update(userReminderTriggers)
    .set({
      lastTriggeredAt: input.firedAt,
      updatedAt: input.firedAt,
      nextRunAt: input.nextRunAt,
    })
    .where(eq(userReminderTriggers.id, input.triggerId))
    .returning();
  return row ?? null;
}

export async function createUserLocationEvent(input: {
  userId: string;
  placeId: string;
  eventType: "enter" | "exit";
  source?: "browser" | "mobile" | "native_bridge";
  confidence?: number;
  metadataJson?: Record<string, unknown> | null;
  occurredAt?: Date;
}) {
  const [row] = await db
    .insert(userLocationEvents)
    .values({
      userId: input.userId,
      placeId: input.placeId,
      eventType: input.eventType,
      source: input.source ?? "browser",
      confidence: input.confidence ?? 100,
      metadataJson: input.metadataJson ?? {},
      occurredAt: input.occurredAt ?? new Date(),
    })
    .returning();
  return row ?? null;
}

type OffsetPayload = { placeSlug: string; offsetMinutes: number; recurrence?: unknown };

/**
 * When a location event arrives, schedule `location_arrival_offset` triggers that match the place slug.
 * Sets `nextRunAt` to occurredAt + offset. Recurring variants are re-armed by dispatch workers.
 *
 * Idempotent per persisted `event.id`: if `metadata_json.locationOffsetSchedulingAppliedAt` is set, returns
 * `{ updated: 0, skipped: true }` without mutating triggers. Pass `executor` (e.g. a transaction client) so
 * create + schedule + marker can commit atomically.
 */
export async function scheduleLocationOffsetTriggersFromEvent(
  event: UserLocationEvent,
  executor: RemindersExecutor = db,
): Promise<{ updated: number; skipped?: boolean }> {
  const [fresh] = await executor
    .select()
    .from(userLocationEvents)
    .where(eq(userLocationEvents.id, event.id))
    .limit(1);
  if (!fresh) return { updated: 0 };

  const priorMeta = asMetadataRecord(fresh.metadataJson);
  if (typeof priorMeta[LOCATION_OFFSET_SCHEDULING_META_KEY] === "string") {
    return { updated: 0, skipped: true };
  }

  const [place] = await executor
    .select()
    .from(userLocationPlaces)
    .where(and(eq(userLocationPlaces.id, fresh.placeId), eq(userLocationPlaces.userId, fresh.userId)))
    .limit(1);
  if (!place) return { updated: 0 };

  if (fresh.eventType !== "enter") {
    return { updated: 0 };
  }

  const joined = await executor
    .select({ t: userReminderTriggers, r: userReminders })
    .from(userReminderTriggers)
    .innerJoin(userReminders, eq(userReminderTriggers.reminderId, userReminders.id))
    .where(
      and(
        eq(userReminders.userId, fresh.userId),
        eq(userReminders.enabled, true),
        eq(userReminderTriggers.isActive, true),
        eq(userReminderTriggers.triggerType, "location_arrival_offset"),
      ),
    );

  let updated = 0;
  const occurred =
    fresh.occurredAt instanceof Date ? fresh.occurredAt : new Date(String(fresh.occurredAt));

  for (const row of joined) {
    const payload = row.t.payloadJson as unknown as OffsetPayload | null;
    if (!payload || typeof payload.offsetMinutes !== "number" || payload.placeSlug !== place.slug) {
      continue;
    }
    const next = new Date(occurred.getTime() + payload.offsetMinutes * 60_000);
    const existingNext =
      row.t.nextRunAt instanceof Date
        ? row.t.nextRunAt
        : row.t.nextRunAt
          ? new Date(String(row.t.nextRunAt))
          : null;
    const targetNext =
      existingNext && existingNext.getTime() < next.getTime() ? existingNext : next;
    await executor
      .update(userReminderTriggers)
      .set({ nextRunAt: targetNext, updatedAt: new Date() })
      .where(eq(userReminderTriggers.id, row.t.id));
    updated += 1;
  }

  const appliedAt = new Date().toISOString();
  await executor
    .update(userLocationEvents)
    .set({
      metadataJson: { ...priorMeta, [LOCATION_OFFSET_SCHEDULING_META_KEY]: appliedAt },
    })
    .where(eq(userLocationEvents.id, fresh.id));

  return { updated };
}

/** Insert a location event and run offset scheduling in one transaction (marker prevents double-apply on replay). */
export async function createUserLocationEventAndScheduleOffsetTriggers(input: {
  userId: string;
  placeId: string;
  eventType: "enter" | "exit";
  source?: "browser" | "mobile" | "native_bridge";
  confidence?: number;
  metadataJson?: Record<string, unknown> | null;
  occurredAt?: Date;
}) {
  return db.transaction(async (tx) => {
    const [event] = await tx
      .insert(userLocationEvents)
      .values({
        userId: input.userId,
        placeId: input.placeId,
        eventType: input.eventType,
        source: input.source ?? "browser",
        confidence: input.confidence ?? 100,
        metadataJson: input.metadataJson ?? {},
        occurredAt: input.occurredAt ?? new Date(),
      })
      .returning();
    if (!event) return null;
    const scheduling = await scheduleLocationOffsetTriggersFromEvent(event, tx);
    return { event, scheduling };
  });
}
