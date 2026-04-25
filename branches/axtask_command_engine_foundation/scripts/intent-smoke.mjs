#!/usr/bin/env node

/**
 * AxTask intent smoke test.
 *
 * This script is intentionally dependency-light. It uses a tiny local parser
 * equivalent so you can run it before wiring TypeScript build paths.
 *
 * After copying shared/intent into the repo, convert this to a TS-based test
 * or import the shared parser through tsx.
 */

const now = new Date("2026-04-25T12:00:00-04:00");

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function tomorrow() {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  return isoDate(d);
}

function parse(input) {
  const raw = input;
  const lower = input.toLowerCase().replace(/^(hey\s+)?ax\s*task[,.:!?\s]*/i, "").trim();

  if (/\b(show|list|what|which|load)\s+(my\s+)?alarms?\b/.test(lower)) {
    return { kind: "alarm_list", confidence: 0.9, raw };
  }

  if (/\b(open|show|go to|navigate to)\s+(the\s+)?calendar\b/.test(lower)) {
    return { kind: "navigation", navigationTarget: "/calendar", confidence: 0.92, raw };
  }

  if (/\b(help me plan|plan|build a plan for|prepare|draft|summarize)\b/.test(lower)) {
    return { kind: "planning_request", planningTopic: input, confidence: 0.78, raw };
  }

  const recurrence =
    /\bevery day\b|\bdaily\b/.test(lower) ? "daily"
    : /\bevery (sunday|monday|tuesday|wednesday|thursday|friday|saturday|week)\b|\bweekly\b/.test(lower) ? "weekly"
    : /\bevery now and again\b|\boccasionally\b/.test(lower) ? "irregular"
    : "none";

  const time12 = lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  let time;
  if (time12) {
    let h = Number(time12[1]);
    const m = time12[2] || "00";
    if (time12[3] === "pm" && h < 12) h += 12;
    if (time12[3] === "am" && h === 12) h = 0;
    time = `${String(h).padStart(2, "0")}:${m}`;
  }

  let date;
  if (/\btomorrow\b/.test(lower)) date = tomorrow();
  if (/\btoday\b/.test(lower)) date = isoDate(now);

  if (/\b(remind me|alarm|notify me|ping me)\b/.test(lower)) {
    return { kind: "create_reminder", date, time, recurrence, confidence: 0.82, raw };
  }

  if (recurrence !== "none" || /\b(add|create|make|task|i need to|i have to)\b/.test(lower)) {
    return {
      kind: recurrence !== "none" ? "create_recurring_task" : "create_task",
      recurrence,
      date,
      time,
      confidence: recurrence !== "none" ? 0.87 : 0.75,
      raw,
    };
  }

  return { kind: "unknown", confidence: 0.1, raw };
}

const samples = [
  "remind me to check oil tomorrow at 7pm",
  "remind me about groceries at 9am",
  "laundry every Saturday morning",
  "do laundry every week",
  "help me plan my report for Josh on April billing hours",
  "show my alarms",
  "open calendar",
  "find billing tasks",
  "mark laundry done",
];

for (const sample of samples) {
  console.log("\n>", sample);
  console.log(JSON.stringify(parse(sample), null, 2));
}
