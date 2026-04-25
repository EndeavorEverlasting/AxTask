import { db } from "../db";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import {
  userReminders,
  userReminderTriggers,
  userLocationEvents,
  userLocationPlaces,
  type UserLocationEvent,
} from "@shared/schema";

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
 * Sets `nextRunAt` to occurredAt + offset (first fire; recurrence handled in a later scheduler PR).
 */
export async function scheduleLocationOffsetTriggersFromEvent(event: UserLocationEvent) {
  const [place] = await db
    .select()
    .from(userLocationPlaces)
    .where(and(eq(userLocationPlaces.id, event.placeId), eq(userLocationPlaces.userId, event.userId)))
    .limit(1);
  if (!place) return { updated: 0 as number };

  if (event.eventType !== "enter") {
    return { updated: 0 as number };
  }

  const joined = await db
    .select({ t: userReminderTriggers, r: userReminders })
    .from(userReminderTriggers)
    .innerJoin(userReminders, eq(userReminderTriggers.reminderId, userReminders.id))
    .where(
      and(
        eq(userReminders.userId, event.userId),
        eq(userReminders.enabled, true),
        eq(userReminderTriggers.isActive, true),
        eq(userReminderTriggers.triggerType, "location_arrival_offset"),
      ),
    );

  let updated = 0;
  const occurred = event.occurredAt instanceof Date ? event.occurredAt : new Date(String(event.occurredAt));

  for (const row of joined) {
    const payload = row.t.payloadJson as unknown as OffsetPayload | null;
    if (!payload || typeof payload.offsetMinutes !== "number" || payload.placeSlug !== place.slug) {
      continue;
    }
    const next = new Date(occurred.getTime() + payload.offsetMinutes * 60_000);
    await db
      .update(userReminderTriggers)
      .set({ nextRunAt: next, updatedAt: new Date() })
      .where(eq(userReminderTriggers.id, row.t.id));
    updated += 1;
  }

  return { updated };
}
