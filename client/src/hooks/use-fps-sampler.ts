import { useEffect, useRef, useState } from "react";

/**
 * Client-only FPS + long-task sampler for the Admin > Performance panel.
 *
 * - FPS is computed from the gap between consecutive requestAnimationFrame
 *   callbacks. We keep a ring buffer of the last ~5 seconds and expose
 *   current, p50, p5 (low) values so an operator can distinguish sustained
 *   jank from a single dropped frame.
 * - Long tasks (>=50ms, per PerformanceObserver type "longtask") are counted
 *   within the same rolling window so the operator sees whether recent jank
 *   correlates with main-thread blocking.
 *
 * Nothing is persisted: this runs in memory only, stops on unmount, and
 * respects prefers-reduced-motion by not rendering a cursor-following
 * overlay (consumers should gate UI accordingly). No data is sent to the
 * server.
 */

export interface FpsSamplerStats {
  /** Rolling-window FPS (latest frame gap). */
  current: number;
  /** Median FPS over the window — the stable baseline. */
  median: number;
  /** 5th-percentile FPS — the "worst 1-in-20 frames" view. */
  low: number;
  /** Long tasks (>=50ms) observed in the window. */
  longTasks: number;
  /** Number of FPS samples currently in the ring buffer. */
  samples: number;
  /** Milliseconds covered by the samples currently in the buffer. */
  windowMs: number;
  /** Whether the sampler is actively collecting. */
  running: boolean;
}

export interface UseFpsSamplerOptions {
  /** Start/stop sampling. Defaults to true. */
  enabled?: boolean;
  /** Rolling window length in milliseconds. Default 5000 ms. */
  windowMs?: number;
  /** How often (ms) to publish a new stats snapshot. Default 500 ms. */
  updateIntervalMs?: number;
}

const DEFAULT_WINDOW_MS = 5_000;
const DEFAULT_UPDATE_MS = 500;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * sorted.length)),
  );
  return sorted[idx]!;
}

export function useFpsSampler(options: UseFpsSamplerOptions = {}): FpsSamplerStats {
  const enabled = options.enabled !== false;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const updateIntervalMs = options.updateIntervalMs ?? DEFAULT_UPDATE_MS;

  const [stats, setStats] = useState<FpsSamplerStats>({
    current: 0,
    median: 0,
    low: 0,
    longTasks: 0,
    samples: 0,
    windowMs,
    running: false,
  });

  // Refs keep per-frame state out of React so we don't rerender every tick.
  const frameGapsRef = useRef<{ t: number; fps: number }[]>([]);
  const longTaskRef = useRef<{ t: number }[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const publishTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const observerRef = useRef<PerformanceObserver | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (typeof window.requestAnimationFrame !== "function") return;

    lastFrameRef.current = null;
    frameGapsRef.current = [];
    longTaskRef.current = [];

    const loop = (now: number) => {
      const prev = lastFrameRef.current;
      if (prev != null) {
        const dt = now - prev;
        if (dt > 0) {
          const fps = 1000 / dt;
          frameGapsRef.current.push({ t: now, fps });
        }
      }
      lastFrameRef.current = now;

      const cutoff = now - windowMs;
      const gaps = frameGapsRef.current;
      // Trim in place from the head (cheap, avoids allocation).
      while (gaps.length > 0 && gaps[0]!.t < cutoff) gaps.shift();
      const lt = longTaskRef.current;
      while (lt.length > 0 && lt[0]!.t < cutoff) lt.shift();

      rafIdRef.current = window.requestAnimationFrame(loop);
    };

    rafIdRef.current = window.requestAnimationFrame(loop);

    if (typeof PerformanceObserver !== "undefined") {
      try {
        const obs = new PerformanceObserver((list) => {
          const now = performance.now();
          for (const entry of list.getEntries()) {
            if (entry.entryType === "longtask") {
              longTaskRef.current.push({ t: now });
            }
          }
        });
        obs.observe({ entryTypes: ["longtask"] });
        observerRef.current = obs;
      } catch {
        observerRef.current = null;
      }
    }

    publishTimerRef.current = setInterval(() => {
      const gaps = frameGapsRef.current;
      const sorted = gaps.map((g) => g.fps).sort((a, b) => a - b);
      const samples = sorted.length;
      const oldest = gaps[0]?.t ?? 0;
      const newest = gaps[gaps.length - 1]?.t ?? 0;
      const current = gaps[gaps.length - 1]?.fps ?? 0;
      const median = percentile(sorted, 50);
      const low = percentile(sorted, 5);
      setStats({
        current: Math.round(current * 10) / 10,
        median: Math.round(median * 10) / 10,
        low: Math.round(low * 10) / 10,
        longTasks: longTaskRef.current.length,
        samples,
        windowMs: samples > 0 ? Math.max(windowMs, newest - oldest) : windowMs,
        running: true,
      });
    }, updateIntervalMs);

    return () => {
      if (rafIdRef.current != null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (publishTimerRef.current != null) {
        clearInterval(publishTimerRef.current);
        publishTimerRef.current = null;
      }
      if (observerRef.current) {
        try {
          observerRef.current.disconnect();
        } catch {
          /* ignore */
        }
        observerRef.current = null;
      }
      setStats((s) => ({ ...s, running: false }));
    };
  }, [enabled, windowMs, updateIntervalMs]);

  return stats;
}
