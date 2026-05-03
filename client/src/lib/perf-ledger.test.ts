import { describe, expect, it } from "vitest";
import { PerfLedger } from "./perf-ledger";

function makeLedger(capacity = 16, windowMs = 10_000) {
  let t = 0;
  const ledger = new PerfLedger({ capacity, windowMs, now: () => t });
  return {
    ledger,
    advance: (ms: number) => {
      t += ms;
    },
    setNow: (ms: number) => {
      t = ms;
    },
  };
}

describe("PerfLedger", () => {
  it("aggregates marks by surface and kind", () => {
    const { ledger, advance } = makeLedger();

    ledger.mark("task-list", "mount", 4.5);
    advance(10);
    ledger.mark("task-list", "update", 1.2, 30);
    advance(10);
    ledger.mark("task-list", "update", 0.8, 31);
    advance(10);
    ledger.mark("admin", "render", 2.0);

    const snap = ledger.snapshot();
    expect(snap.totalMarks).toBe(4);
    const task = snap.rows.find((r) => r.surface === "task-list")!;
    expect(task.mounts).toBe(1);
    expect(task.updates).toBe(2);
    expect(task.renders).toBe(0);
    expect(task.maxRowCount).toBe(31);
    expect(task.totalMs).toBeCloseTo(6.5, 5);
    const admin = snap.rows.find((r) => r.surface === "admin")!;
    expect(admin.renders).toBe(1);
    expect(admin.totalMs).toBeCloseTo(2.0, 5);
  });

  it("sorts rows by totalMs descending", () => {
    const { ledger } = makeLedger();
    ledger.mark("alpha", "render", 1);
    ledger.mark("beta", "render", 5);
    ledger.mark("gamma", "render", 3);
    const snap = ledger.snapshot();
    expect(snap.rows.map((r) => r.surface)).toEqual(["beta", "gamma", "alpha"]);
  });

  it("drops marks older than the window", () => {
    const { ledger, setNow } = makeLedger(16, 1_000);
    setNow(0);
    ledger.mark("old", "render", 10);
    setNow(2_000);
    ledger.mark("new", "render", 1);

    const snap = ledger.snapshot();
    expect(snap.rows.map((r) => r.surface)).toEqual(["new"]);
  });

  it("overwrites oldest entries when the ring is full", () => {
    const { ledger } = makeLedger(4);
    for (let i = 0; i < 10; i++) ledger.mark("s", "render", i + 1);
    const snap = ledger.snapshot();
    expect(ledger.getSize()).toBe(4);
    const total = 7 + 8 + 9 + 10;
    expect(snap.rows[0]!.totalMs).toBeCloseTo(total, 5);
    expect(snap.totalMarks).toBe(10);
  });

  it("computes p50 and p95 across durations for a surface", () => {
    const { ledger } = makeLedger(32);
    const durations = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (const d of durations) ledger.mark("task-list", "update", d);
    const snap = ledger.snapshot();
    const row = snap.rows.find((r) => r.surface === "task-list")!;
    expect(row.p50Ms).toBeCloseTo(5, 1);
    expect(row.p95Ms).toBeCloseTo(10, 1);
  });

  it("tracks longtask kind separately from totalMs", () => {
    const { ledger } = makeLedger();
    ledger.mark("task-list", "update", 2);
    ledger.mark("task-list", "longtask", 80);
    const snap = ledger.snapshot();
    const row = snap.rows.find((r) => r.surface === "task-list")!;
    expect(row.longtasks).toBe(1);
    expect(row.longtaskMs).toBeCloseTo(80, 5);
    expect(row.totalMs).toBeCloseTo(82, 5);
  });

  it("rejects negative or non-finite durations and empty surface names", () => {
    const { ledger } = makeLedger();
    ledger.mark("task-list", "render", -1);
    ledger.mark("task-list", "render", Number.NaN);
    ledger.mark("", "render", 5);
    const snap = ledger.snapshot();
    expect(snap.totalMarks).toBe(0);
    expect(snap.rows).toEqual([]);
  });

  it("notifies subscribers with a fresh snapshot", () => {
    const { ledger } = makeLedger();
    const received: number[] = [];
    const unsub = ledger.subscribe((s) => received.push(s.totalMarks));
    ledger.mark("x", "render", 1);
    ledger.notifySubscribers();
    ledger.mark("x", "render", 1);
    ledger.notifySubscribers();
    unsub();
    ledger.mark("x", "render", 1);
    ledger.notifySubscribers();
    expect(received).toEqual([1, 2]);
  });

  it("reset clears the ring without affecting future writes", () => {
    const { ledger } = makeLedger();
    ledger.mark("a", "render", 5);
    ledger.reset();
    ledger.mark("b", "render", 2);
    const snap = ledger.snapshot();
    expect(snap.totalMarks).toBe(1);
    expect(snap.rows.map((r) => r.surface)).toEqual(["b"]);
  });
});
