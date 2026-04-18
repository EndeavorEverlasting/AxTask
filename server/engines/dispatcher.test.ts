import { describe, expect, it } from "vitest";
import { dispatchVoiceCommand } from "./dispatcher";
import type { Task } from "@shared/schema";

const emptyTasks: Task[] = [];
const userId = "test-user";
const todayStr = "2026-04-16";
const now = new Date("2026-04-16T12:00:00Z");

describe("dispatchVoiceCommand", () => {
  it("navigates to shopping list", async () => {
    const r = await dispatchVoiceCommand("open my shopping list", emptyTasks, userId, todayStr, now);
    expect(r.intent).toBe("navigation");
    expect(r.action).toBe("navigate");
    expect(r.payload.path).toBe("/shopping");
  });

  it("creates shopping tasks from a single item utterance", async () => {
    const r = await dispatchVoiceCommand("add milk to my shopping list", emptyTasks, userId, todayStr, now);
    expect(r.action).toBe("create_shopping_tasks");
    expect(r.payload.items).toEqual(["milk"]);
    expect(r.payload.date).toBe(todayStr);
    expect(r.message).not.toMatch(/^On it —/);
  });

  it("uses delegation tone when avatar phrasing is present", async () => {
    const r = await dispatchVoiceCommand(
      "get the avatar to add milk to my shopping list",
      emptyTasks,
      userId,
      todayStr,
      now,
    );
    expect(r.action).toBe("create_shopping_tasks");
    expect(r.message.startsWith("On it —")).toBe(true);
  });

  it("creates multiple shopping tasks", async () => {
    const r = await dispatchVoiceCommand(
      "add milk, eggs, and bread to my shopping list",
      emptyTasks,
      userId,
      todayStr,
      now,
    );
    expect(r.action).toBe("create_shopping_tasks");
    expect(r.payload.items).toEqual(["milk", "eggs", "bread"]);
  });
});
