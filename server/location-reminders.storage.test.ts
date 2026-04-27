// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { userLocationEvents, userLocationPlaces, userReminderTriggers, userReminders } from "@shared/schema";
import type { UserLocationEvent, UserLocationPlace } from "@shared/schema";
import {
  LOCATION_OFFSET_SCHEDULING_META_KEY,
  scheduleLocationOffsetTriggersFromEvent,
} from "./storage/reminders";

/** Select result queue: each terminal `await` consumes one array. */
const hoisted = vi.hoisted(() => {
  const selectRowsQueue: unknown[][] = [];
  const insertReturningQueue: unknown[][] = [];
  const updateReturningQueue: unknown[][] = [];
  let transactionFn: ((tx: Tx) => Promise<unknown>) | null = null;

  function dequeue(rows: unknown[][]) {
    const next = rows.shift();
    return Promise.resolve(next ?? []);
  }

  type Tx = {
    insert: () => { values: () => { returning: () => Promise<unknown[]> } };
    select: () => ReturnType<typeof selectBuilder>;
    update: () => { set: () => { where: () => { returning: () => Promise<unknown[]> } } };
  };

  function selectBuilder() {
    return {
      from() {
        return {
          innerJoin() {
            return {
              where() {
                return dequeue(selectRowsQueue);
              },
            };
          },
          where() {
            return {
              orderBy() {
                const afterOrderBy = {
                  limit(_n: number) {
                    return dequeue(selectRowsQueue);
                  },
                  then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
                    return dequeue(selectRowsQueue).then(onFulfilled, onRejected);
                  },
                };
                return afterOrderBy;
              },
              limit(_n: number) {
                return dequeue(selectRowsQueue);
              },
            };
          },
        };
      },
    };
  }

  const chain = {
    select: selectBuilder,
    insert() {
      return {
        values() {
          return {
            returning: () => dequeue(insertReturningQueue),
          };
        },
      };
    },
    update() {
      return {
        set() {
          return {
            where() {
              return {
                returning: () => dequeue(updateReturningQueue),
              };
            },
          };
        },
      };
    },
    transaction: vi.fn(async (fn: (tx: Tx) => Promise<unknown>) => {
      transactionFn = fn;
      const tx: Tx = {
        insert: chain.insert,
        select: chain.select,
        update: chain.update,
      };
      return fn(tx);
    }),
  };

  return {
    selectRowsQueue,
    insertReturningQueue,
    updateReturningQueue,
    chain,
    getTransactionFn: () => transactionFn,
    reset() {
      selectRowsQueue.length = 0;
      insertReturningQueue.length = 0;
      updateReturningQueue.length = 0;
      transactionFn = null;
      chain.transaction.mockClear();
    },
  };
});

vi.mock("./db", () => ({
  db: hoisted.chain,
}));

import {
  resolvePlaceAlias,
  listUserLocationPlaces,
} from "./storage/locations";
import {
  createReminderWithTrigger,
  listDueReminderTriggers,
  markReminderTriggered,
} from "./storage/reminders";
import { logAiInteraction, markAiInteractionAccepted, markAiInteractionRejected } from "./storage/ai";

describe("location + reminder storage (mocked db)", () => {
  beforeEach(() => {
    hoisted.reset();
  });

  it("resolvePlaceAlias returns home row after default-home select chain", async () => {
    const home: Partial<UserLocationPlace> = {
      id: "p-home",
      userId: "u1",
      slug: "home",
      placeType: "home",
      label: "Home",
    };
    hoisted.selectRowsQueue.push([home]);
    const row = await resolvePlaceAlias("u1", "home");
    expect(row?.id).toBe("p-home");
  });

  it("resolvePlaceAlias returns work row", async () => {
    const work: Partial<UserLocationPlace> = {
      id: "p-work",
      userId: "u1",
      slug: "work",
      placeType: "work",
      label: "Office",
    };
    hoisted.selectRowsQueue.push([work]);
    const row = await resolvePlaceAlias("u1", "work");
    expect(row?.placeType).toBe("work");
  });

  it("resolvePlaceAlias resolves custom slug (no orderBy)", async () => {
    const gym: Partial<UserLocationPlace> = {
      id: "p-gym",
      userId: "u1",
      slug: "gym",
      placeType: "custom",
      label: "Gym",
    };
    hoisted.selectRowsQueue.push([gym]);
    const row = await resolvePlaceAlias("u1", "gym");
    expect(row?.slug).toBe("gym");
  });

  it("listUserLocationPlaces returns ordered rows", async () => {
    const a: Partial<UserLocationPlace> = { id: "1", userId: "u1", slug: "a", label: "A", name: "A" };
    const b: Partial<UserLocationPlace> = { id: "2", userId: "u1", slug: "b", label: "B", name: "B" };
    hoisted.selectRowsQueue.push([a, b]);
    const rows = await listUserLocationPlaces("u1");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe("1");
  });

  it("createReminderWithTrigger inserts reminder then trigger in a transaction", async () => {
    hoisted.insertReturningQueue.push([{ id: "rem-1", userId: "u1", title: "Oil", kind: "location_offset" }]);
    hoisted.insertReturningQueue.push([{ id: "trig-1", reminderId: "rem-1", triggerType: "location_arrival_offset" }]);

    const out = await createReminderWithTrigger({
      reminder: {
        userId: "u1",
        kind: "location_offset",
        title: "Oil",
        body: null,
        enabled: true,
        createdBy: "user",
      },
      trigger: {
        triggerType: "location_arrival_offset",
        payloadJson: { placeSlug: "home", offsetMinutes: 5 },
        nextRunAt: null,
        lastTriggeredAt: null,
        cooldownSeconds: 0,
        isActive: true,
      },
    });

    expect(out.reminder.id).toBe("rem-1");
    expect(out.trigger.reminderId).toBe("rem-1");
    expect(hoisted.chain.transaction).toHaveBeenCalledTimes(1);
  });

  it("listDueReminderTriggers returns trigger rows due by now", async () => {
    const trig = { id: "t1", reminderId: "r1", triggerType: "datetime", nextRunAt: new Date(), isActive: true };
    hoisted.selectRowsQueue.push([{ t: trig }]);
    const due = await listDueReminderTriggers(new Date("2030-01-01"));
    expect(due).toHaveLength(1);
    expect(due[0]?.id).toBe("t1");
  });

  it("markReminderTriggered clears nextRunAt", async () => {
    const when = new Date("2030-06-01T12:00:00Z");
    hoisted.updateReturningQueue.push([{ id: "t1", lastTriggeredAt: when, nextRunAt: null }]);
    const row = await markReminderTriggered("t1", when);
    expect(row?.nextRunAt).toBeNull();
    expect(row?.lastTriggeredAt).toEqual(when);
  });

  it("logAiInteraction then mark accepted / rejected", async () => {
    hoisted.insertReturningQueue.push([
      { id: "ai-1", userId: "u1", rawMessage: "hello", accepted: null as boolean | null },
    ]);
    const created = await logAiInteraction({
      userId: "u1",
      rawMessage: "hello",
      intentKind: "create_reminder",
    });
    expect(created?.id).toBe("ai-1");

    hoisted.updateReturningQueue.push([{ id: "ai-1", accepted: true, rejectedReason: null }]);
    const ok = await markAiInteractionAccepted("ai-1", "u1");
    expect(ok?.accepted).toBe(true);

    hoisted.updateReturningQueue.push([{ id: "ai-1", accepted: false, rejectedReason: "bad" }]);
    const bad = await markAiInteractionRejected("ai-1", "u1", "bad");
    expect(bad?.accepted).toBe(false);
    expect(bad?.rejectedReason).toBe("bad");
  });
});

describe("scheduleLocationOffsetTriggersFromEvent (fake executor)", () => {
  it("schedules nextRunAt for matching location_arrival_offset trigger on enter", async () => {
    const occurred = new Date("2030-01-15T10:00:00.000Z");
    const event: UserLocationEvent = {
      id: "evt-1",
      userId: "u1",
      placeId: "place-home",
      eventType: "enter",
      source: "browser",
      confidence: 100,
      metadataJson: {},
      occurredAt: occurred,
      createdAt: occurred,
    };
    const place: UserLocationPlace = {
      id: "place-home",
      userId: "u1",
      name: "Home",
      slug: "home",
      placeType: "home",
      label: "Home",
      notes: null,
      lat: null,
      lng: null,
      radiusMeters: 200,
      isDefault: true,
      isActive: true,
      source: "manual_pin",
      geocodeAccuracyMeters: null,
      lastVerifiedAt: null,
      lastEnteredAt: null,
      lastExitedAt: null,
      createdAt: occurred,
      updatedAt: occurred,
    };
    const reminder = {
      id: "rem-1",
      userId: "u1",
      kind: "location_offset",
      title: "Check oil",
      body: null,
      enabled: true,
      createdBy: "user",
      createdAt: occurred,
      updatedAt: occurred,
    };
    const triggerRow = {
      id: "trig-1",
      reminderId: "rem-1",
      triggerType: "location_arrival_offset",
      payloadJson: { placeSlug: "home", offsetMinutes: 5 },
      nextRunAt: null as Date | null,
      lastTriggeredAt: null as Date | null,
      cooldownSeconds: 0,
      isActive: true,
      createdAt: occurred,
      updatedAt: occurred,
    };

    const triggerUpdates: { id: string; nextRunAt: Date | null }[] = [];
    const eventMetaUpdates: unknown[] = [];

    const executor = {
      select() {
        return {
          from(table: typeof userLocationEvents | typeof userLocationPlaces | typeof userReminderTriggers) {
            if (table === userReminderTriggers) {
              return {
                innerJoin(_other: unknown, _on: unknown) {
                  return {
                    where() {
                      return Promise.resolve([{ t: triggerRow, r: reminder }]);
                    },
                  };
                },
              };
            }
            return {
              where() {
                return {
                  limit() {
                    if (table === userLocationEvents) {
                      return Promise.resolve([event]);
                    }
                    if (table === userLocationPlaces) {
                      return Promise.resolve([place]);
                    }
                    return Promise.resolve([]);
                  },
                };
              },
            };
          },
        };
      },
      update(table: typeof userReminderTriggers | typeof userLocationEvents) {
        return {
          set(patch: Record<string, unknown>) {
            return {
              where(pred: unknown) {
                if (table === userReminderTriggers) {
                  triggerUpdates.push({
                    id: "trig-1",
                    nextRunAt: patch.nextRunAt as Date | null,
                  });
                }
                if (table === userLocationEvents) {
                  eventMetaUpdates.push(patch.metadataJson);
                }
                return Promise.resolve([]);
              },
            };
          },
        };
      },
    };

    const result = await scheduleLocationOffsetTriggersFromEvent(event, executor as never);
    expect(result.updated).toBe(1);
    expect(triggerUpdates[0]?.nextRunAt?.toISOString()).toBe("2030-01-15T10:05:00.000Z");
    expect(eventMetaUpdates.length).toBe(1);
    const meta = eventMetaUpdates[0] as Record<string, unknown>;
    expect(typeof meta[LOCATION_OFFSET_SCHEDULING_META_KEY]).toBe("string");
  });

  it("returns skipped when offset scheduling marker already present", async () => {
    const occurred = new Date("2030-01-15T10:00:00.000Z");
    const event: UserLocationEvent = {
      id: "evt-2",
      userId: "u1",
      placeId: "place-home",
      eventType: "enter",
      source: "browser",
      confidence: 100,
      metadataJson: { [LOCATION_OFFSET_SCHEDULING_META_KEY]: "2030-01-15T10:00:01.000Z" },
      occurredAt: occurred,
      createdAt: occurred,
    };
    const executor = {
      select() {
        return {
          from() {
            return {
              where() {
                return {
                  limit() {
                    return Promise.resolve([event]);
                  },
                };
              },
            };
          },
        };
      },
    };
    const result = await scheduleLocationOffsetTriggersFromEvent(event, executor as never);
    expect(result.skipped).toBe(true);
    expect(result.updated).toBe(0);
  });

  it("no-op on exit events", async () => {
    const occurred = new Date("2030-01-15T10:00:00.000Z");
    const event: UserLocationEvent = {
      id: "evt-3",
      userId: "u1",
      placeId: "place-home",
      eventType: "exit",
      source: "browser",
      confidence: 100,
      metadataJson: {},
      occurredAt: occurred,
      createdAt: occurred,
    };
    const executor = {
      select() {
        return {
          from() {
            return {
              where() {
                return {
                  limit() {
                    return Promise.resolve([event]);
                  },
                };
              },
            };
          },
        };
      },
    };
    const result = await scheduleLocationOffsetTriggersFromEvent(event, executor as never);
    expect(result.updated).toBe(0);
  });
});
