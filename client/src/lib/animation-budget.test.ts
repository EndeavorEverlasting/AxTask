import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnimationBudget } from "./animation-budget";

function makeBudget(overrides: Partial<ConstructorParameters<typeof AnimationBudget>[0]> = {}) {
  let t = 0;
  const events = new Map<string, Array<(ev?: Event) => void>>();
  const win = {
    matchMedia: (_q: string) => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    addEventListener: (type: string, cb: (ev?: Event) => void) => {
      const list = events.get(type) ?? [];
      list.push(cb);
      events.set(type, list);
    },
    removeEventListener: () => {},
  } as unknown as Window;
  const doc = {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as Document;
  const b = new AnimationBudget({
    scrollPauseMs: 250,
    longTaskPauseMs: 400,
    now: () => t,
    doc,
    win,
    ...overrides,
  });
  return {
    b,
    advance: (ms: number) => {
      t += ms;
    },
    dispatch: (type: string) => {
      const list = events.get(type) ?? [];
      for (const cb of list) cb();
    },
    events,
  };
}

describe("AnimationBudget", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  it("starts allowed and notifies subscribers when it pauses and resumes", () => {
    const { b } = makeBudget();
    b.start();
    expect(b.isAllowed()).toBe(true);

    const received: boolean[] = [];
    b.subscribe((s) => received.push(s.allowed));

    b.pauseFor(100, "scroll");
    expect(b.isAllowed()).toBe(false);
    expect(received).toContain(false);

    vi.advanceTimersByTime(150);
    expect(b.isAllowed()).toBe(true);
    expect(received.at(-1)).toBe(true);
    b.stop();
  });

  it("scroll events pause animation for scrollPauseMs", () => {
    const { b, dispatch } = makeBudget();
    b.start();
    dispatch("scroll");
    expect(b.isAllowed()).toBe(false);
    expect(b.getState().reason).toBe("scroll");
    vi.advanceTimersByTime(260);
    expect(b.isAllowed()).toBe(true);
    b.stop();
  });

  it("respects prefers-reduced-motion as an always-denied state", () => {
    const win = {
      matchMedia: () => ({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as Window;
    const doc = {
      visibilityState: "visible" as DocumentVisibilityState,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as Document;
    const b = new AnimationBudget({ win, doc, now: () => 0 });
    b.start();
    expect(b.isAllowed()).toBe(false);
    expect(b.getState().reason).toBe("reduced-motion");
    b.stop();
  });

  it("stacks pauses so the later deadline wins", () => {
    const { b } = makeBudget();
    b.start();
    b.pauseFor(100, "scroll");
    b.pauseFor(500, "longtask");
    vi.advanceTimersByTime(200);
    expect(b.isAllowed()).toBe(false);
    vi.advanceTimersByTime(400);
    expect(b.isAllowed()).toBe(true);
    b.stop();
  });

  it("unsubscribe detaches the listener", () => {
    const { b } = makeBudget();
    b.start();
    const cb = vi.fn();
    const off = b.subscribe(cb);
    b.pauseFor(50, "scroll");
    off();
    vi.advanceTimersByTime(100);
    expect(cb).toHaveBeenCalled();
    const calls = cb.mock.calls.length;
    b.pauseFor(50, "scroll");
    vi.advanceTimersByTime(100);
    expect(cb.mock.calls.length).toBe(calls);
    b.stop();
  });
});
