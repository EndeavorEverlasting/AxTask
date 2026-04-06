import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOfflineTaskQueue,
  enqueueTaskCreate,
  enqueueTaskDelete,
  enqueueTaskUpdate,
  peekOfflineQueue,
  setOfflineQueueUserScope,
} from "./offline-task-queue";

const SCOPED_KEY = "axtask.offline_task_queue.v1:user:test-user";

describe("offline-task-queue", () => {
  beforeEach(() => {
    setOfflineQueueUserScope("test-user");
  });
  afterEach(() => {
    clearOfflineTaskQueue();
    setOfflineQueueUserScope(null);
    vi.restoreAllMocks();
  });

  it("merges consecutive updates for the same task", () => {
    enqueueTaskUpdate("t1", { status: "in-progress" }, "iso1");
    enqueueTaskUpdate("t1", { date: "2026-01-20" }, "iso1");
    const q = peekOfflineQueue();
    expect(q.length).toBe(1);
    expect(q[0].kind).toBe("update");
    if (q[0].kind === "update") {
      expect(q[0].patch).toMatchObject({ status: "in-progress", date: "2026-01-20" });
      expect(q[0].baseUpdatedAt).toBe("iso1");
    }
  });

  it("delete drops pending updates for that task", () => {
    enqueueTaskUpdate("t1", { status: "completed" }, "iso1");
    enqueueTaskDelete("t1", "iso1");
    const q = peekOfflineQueue();
    expect(q.length).toBe(1);
    expect(q[0].kind).toBe("delete");
  });

  it("persists to localStorage", () => {
    enqueueTaskCreate("cid", { date: "2026-01-01", activity: "A" } as import("@shared/schema").InsertTask);
    const raw = localStorage.getItem(SCOPED_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).length).toBe(1);
  });
});
