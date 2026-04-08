// @vitest-environment node
import { describe, expect, it } from "vitest";
import { classifyIntent, dispatchVoiceCommand } from "./dispatcher";
import type { Task } from "@shared/schema";
import { isMetaOnlyTaskSearchRequest, tryVoiceHelpIntent } from "@shared/voice-dispatch";

const emptyTasks: Task[] = [];
const uid = "u1";
const today = "2026-04-07";
const now = new Date("2026-04-07T12:00:00Z");

describe("voice navigation & golden utterances", () => {
  it("classifies take me to the calendar as navigation", () => {
    expect(classifyIntent("Take me to the calendar")).toBe("navigation");
  });

  it("classifies bring me to import export as navigation", () => {
    expect(classifyIntent("Bring me to import export")).toBe("navigation");
  });

  it("does not treat completed tasks as a tasks-page navigation target", () => {
    expect(classifyIntent("Show me completed tasks")).not.toBe("navigation");
  });

  it("dispatches calendar navigation", async () => {
    const r = await dispatchVoiceCommand("Take me to the calendar", emptyTasks, uid, today, now);
    expect(r.action).toBe("navigate");
    expect(r.payload.path).toBe("/calendar");
  });

  it("dispatches open_new_task for add a new task", async () => {
    const r = await dispatchVoiceCommand("Add a new task", emptyTasks, uid, today, now);
    expect(r.intent).toBe("task_create");
    expect(r.action).toBe("open_new_task");
  });

  it("dispatches prepare_task_search for meta search phrase", async () => {
    const r = await dispatchVoiceCommand("Search for a task", emptyTasks, uid, today, now);
    expect(r.action).toBe("prepare_task_search");
  });

  it("dispatches show_results for concrete search", async () => {
    const r = await dispatchVoiceCommand("Search for invoices", emptyTasks, uid, today, now);
    expect(r.action).toBe("show_results");
    expect(r.payload.query).toBe("invoices");
  });
});

describe("isMetaOnlyTaskSearchRequest", () => {
  it("detects meta-only phrases", () => {
    expect(isMetaOnlyTaskSearchRequest("search for a task")).toBe(true);
    expect(isMetaOnlyTaskSearchRequest("find tasks")).toBe(true);
    expect(isMetaOnlyTaskSearchRequest("I want to search tasks")).toBe(true);
  });
  it("rejects phrases with a real query", () => {
    expect(isMetaOnlyTaskSearchRequest("search for invoices")).toBe(false);
    expect(isMetaOnlyTaskSearchRequest("find report")).toBe(false);
  });
});

describe("help & tutorial intents", () => {
  it("tryVoiceHelpIntent matches common discovery phrases", () => {
    expect(tryVoiceHelpIntent("what commands are available")).not.toBeNull();
    expect(tryVoiceHelpIntent("what can I say")).not.toBeNull();
  });

  it("dispatches show_help", async () => {
    const r = await dispatchVoiceCommand("what can I say", emptyTasks, uid, today, now);
    expect(r.intent).toBe("help");
    expect(r.action).toBe("show_help");
  });

  it("dispatches tutorial_start", async () => {
    const r = await dispatchVoiceCommand("start tutorial", emptyTasks, uid, today, now);
    expect(r.action).toBe("tutorial_start");
  });

  it("dispatches tutorial_jump with step id", async () => {
    const r = await dispatchVoiceCommand("tutorial for calendar", emptyTasks, uid, today, now);
    expect(r.action).toBe("tutorial_jump");
    expect(r.payload.stepId).toBe("calendar");
  });
});

describe("module guide", () => {
  it("answers what is import", async () => {
    const r = await dispatchVoiceCommand("what is import", emptyTasks, uid, today, now);
    expect(r.intent).toBe("module_guide");
    expect(r.action).toBe("show_answer");
    expect(r.message).toContain("Import");
  });
});
