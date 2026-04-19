import { useLayoutEffect, useRef } from "react";
import { perfLedger, type PerfLedger } from "@/lib/perf-ledger";

/**
 * usePerfSurface — tag a React subtree as an AxTask "surface" so the
 * `PerfLedger` and long-task attributor can account for its main-thread cost.
 *
 * Usage:
 *
 * ```tsx
 * const ref = usePerfSurface("task-list");
 * return <section ref={ref}>...</section>;
 * ```
 *
 * The hook:
 *  - writes `data-axtask-surface="<name>"` onto the attached element so the
 *    long-task attributor can find it via `document.querySelectorAll`,
 *  - emits a `mount` mark on first paint and a `render` mark on every
 *    subsequent render pass, each carrying the elapsed layout time.
 *
 * It intentionally uses `useLayoutEffect` so the mark is recorded **after**
 * the browser has applied styles for this render but before paint.
 */
export function usePerfSurface<T extends HTMLElement = HTMLElement>(
  surface: string,
  opts: { ledger?: PerfLedger; rowCount?: number } = {},
): React.RefObject<T> {
  const ref = useRef<T>(null);
  const mountedRef = useRef(false);
  const renderStartRef = useRef<number>(0);

  renderStartRef.current = nowMs();

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !el.dataset.axtaskSurface) {
      el.dataset.axtaskSurface = surface;
    }
    const ledger = opts.ledger ?? perfLedger();
    const dur = Math.max(0, nowMs() - renderStartRef.current);
    if (!mountedRef.current) {
      mountedRef.current = true;
      ledger.mark(surface, "mount", dur, opts.rowCount);
    } else {
      ledger.mark(surface, "render", dur, opts.rowCount);
    }
  });

  return ref as React.RefObject<T>;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
