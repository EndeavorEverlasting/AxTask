import { describe, expect, it, beforeEach } from "vitest";
import { PerfLedger } from "./perf-ledger";
import { createLongTaskAttributor } from "./long-task-attributor";

function makeSurface(name: string, rect: DOMRect): HTMLElement {
  const el = document.createElement("div");
  el.dataset.axtaskSurface = name;
  el.getBoundingClientRect = () => rect;
  document.body.appendChild(el);
  return el;
}

function rect(x: number, y: number, w: number, h: number): DOMRect {
  return {
    x,
    y,
    left: x,
    top: y,
    right: x + w,
    bottom: y + h,
    width: w,
    height: h,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("longTaskAttributor", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("attributes to the largest visible tagged surface", () => {
    const ledger = new PerfLedger();
    makeSurface("task-list", rect(0, 0, 800, 600));
    makeSurface("sidebar", rect(0, 0, 100, 100));
    const attributor = createLongTaskAttributor({
      ledger,
      viewport: () => ({ width: 1024, height: 768 }),
    });

    const surface = attributor.attribute(120);
    expect(surface).toBe("task-list");

    const snap = ledger.snapshot();
    const row = snap.rows.find((r) => r.surface === "task-list")!;
    expect(row.longtasks).toBe(1);
    expect(row.longtaskMs).toBeCloseTo(120, 5);
  });

  it("falls back to 'unknown' when no surfaces are tagged", () => {
    const ledger = new PerfLedger();
    const attributor = createLongTaskAttributor({
      ledger,
      viewport: () => ({ width: 1024, height: 768 }),
    });
    expect(attributor.attribute(80)).toBe("unknown");
  });

  it("ignores offscreen surfaces in favor of in-viewport ones", () => {
    const ledger = new PerfLedger();
    makeSurface("offscreen", rect(-2000, -2000, 1500, 1500));
    makeSurface("visible", rect(10, 10, 300, 400));
    const attributor = createLongTaskAttributor({
      ledger,
      viewport: () => ({ width: 1024, height: 768 }),
    });
    expect(attributor.attribute(60)).toBe("visible");
  });
});
