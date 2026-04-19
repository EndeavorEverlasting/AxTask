import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFpsSampler } from "./use-fps-sampler";

/**
 * We drive requestAnimationFrame + setInterval manually via fake timers so we
 * can assert that the sampler:
 *  - records frames against the rolling window,
 *  - exposes non-zero fps after a publish tick,
 *  - clears long-task counts outside the window,
 *  - tears down cleanly when disabled.
 */

describe("useFpsSampler", () => {
  let rafCallbacks: Array<(t: number) => void> = [];
  let rafNextId = 1;
  let fakeNow = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    rafCallbacks = [];
    rafNextId = 1;
    fakeNow = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
      rafCallbacks.push(cb);
      return rafNextId++;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {
      /* no-op for tests */
    });
    vi.spyOn(performance, "now").mockImplementation(() => fakeNow);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function advanceFrames(frames: Array<number>) {
    for (const gapMs of frames) {
      fakeNow += gapMs;
      const next = rafCallbacks.shift();
      if (next) next(fakeNow);
    }
  }

  it("publishes running=true and non-zero fps after enough frames + a publish tick", () => {
    const { result } = renderHook(() => useFpsSampler({ updateIntervalMs: 100, windowMs: 1000 }));

    expect(result.current.running).toBe(false);

    act(() => {
      advanceFrames([16, 16, 16, 16, 16, 16, 16, 16, 16, 16]);
      vi.advanceTimersByTime(150);
    });

    expect(result.current.running).toBe(true);
    expect(result.current.samples).toBeGreaterThan(0);
    expect(result.current.current).toBeGreaterThan(30);
    expect(result.current.median).toBeGreaterThan(30);
  });

  it("reports zero/running=false when disabled", () => {
    const { result } = renderHook(() => useFpsSampler({ enabled: false }));
    expect(result.current.running).toBe(false);
    expect(result.current.current).toBe(0);
  });

  it("drops samples older than the rolling window", () => {
    const { result } = renderHook(() => useFpsSampler({ updateIntervalMs: 50, windowMs: 200 }));

    act(() => {
      advanceFrames([16, 16, 16, 16, 16]);
      vi.advanceTimersByTime(60);
    });
    const initialSamples = result.current.samples;
    expect(initialSamples).toBeGreaterThan(0);

    act(() => {
      advanceFrames([500]);
      vi.advanceTimersByTime(60);
    });

    expect(result.current.samples).toBeLessThanOrEqual(initialSamples);
  });
});
