import { perfLedger, type PerfLedger } from "./perf-ledger";

/**
 * Long-task attributor
 *
 * Subscribes to `PerformanceObserver("longtask")` and, for each >=50ms
 * main-thread task, blames the surface that was most likely on-screen at the
 * time the task fired. A surface is any element carrying
 * `data-axtask-surface="<name>"` (set by `usePerfSurface` or imperative
 * code). The largest in-viewport surface wins; if nothing is tagged we fall
 * back to `"unknown"`.
 *
 * The observer is a **singleton** so tests can swap it out. Nothing is sent
 * to the server — attribution is purely client-local, same doctrine as
 * `use-fps-sampler`.
 */

export interface LongTaskAttributor {
  start(): void;
  stop(): void;
  attribute(durMs: number): string;
}

export interface AttributorOptions {
  ledger?: PerfLedger;
  root?: Document | null;
  viewport?: () => { width: number; height: number };
}

export function createLongTaskAttributor(
  opts: AttributorOptions = {},
): LongTaskAttributor {
  const ledger = opts.ledger ?? perfLedger();
  const root: Document | null =
    opts.root ?? (typeof document !== "undefined" ? document : null);
  const viewport =
    opts.viewport ??
    (() => {
      if (typeof window === "undefined") return { width: 0, height: 0 };
      return { width: window.innerWidth, height: window.innerHeight };
    });

  let observer: PerformanceObserver | null = null;

  const attribute = (durMs: number): string => {
    if (!root) return "unknown";
    const nodes = root.querySelectorAll<HTMLElement>("[data-axtask-surface]");
    if (nodes.length === 0) return "unknown";

    const vp = viewport();
    let bestSurface = "unknown";
    let bestArea = 0;
    for (const el of Array.from(nodes)) {
      const surface = el.dataset.axtaskSurface;
      if (!surface) continue;
      const rect = el.getBoundingClientRect();
      const w = Math.max(0, Math.min(rect.right, vp.width) - Math.max(rect.left, 0));
      const h = Math.max(
        0,
        Math.min(rect.bottom, vp.height) - Math.max(rect.top, 0),
      );
      const area = w * h;
      if (area > bestArea) {
        bestArea = area;
        bestSurface = surface;
      }
    }
    ledger.mark(bestSurface, "longtask", durMs);
    return bestSurface;
  };

  const start = () => {
    if (observer) return;
    if (typeof PerformanceObserver === "undefined") return;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType !== "longtask") continue;
          attribute(entry.duration);
        }
      });
      observer.observe({ entryTypes: ["longtask"] });
    } catch {
      observer = null;
    }
  };

  const stop = () => {
    if (!observer) return;
    try {
      observer.disconnect();
    } catch {
      /* ignore */
    }
    observer = null;
  };

  return { start, stop, attribute };
}

let sharedAttributor: LongTaskAttributor | null = null;

/** Start the shared attributor exactly once for the lifetime of the app. */
export function startSharedLongTaskAttributor(opts?: AttributorOptions): void {
  if (sharedAttributor) return;
  sharedAttributor = createLongTaskAttributor(opts);
  sharedAttributor.start();
}

export function stopSharedLongTaskAttributor(): void {
  if (!sharedAttributor) return;
  sharedAttributor.stop();
  sharedAttributor = null;
}
