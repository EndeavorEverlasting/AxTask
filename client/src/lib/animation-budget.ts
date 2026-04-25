/**
 * Animation budget — a tiny hub every ambient rAF animation (orbs, chips,
 * count-ups, background visuals) subscribes to, so they all pause in unison
 * when the main thread is under pressure.
 *
 * Inputs:
 *  - scroll events on window (and any registered ancestor) → pause 250ms
 *  - `PerformanceObserver("longtask")` → pause 400ms
 *  - `document.visibilityState === "hidden"` → pause until visible
 *  - user `prefers-reduced-motion: reduce` → permanently report !allowed
 *
 * Output:
 *  - `isAnimationAllowed()` — synchronous read
 *  - `subscribeAnimationBudget(cb)` — notified when state transitions
 *
 * The goal is not pretty math: it's that background animations never compete
 * for the main thread with the user's scroll. Interactive content (modals,
 * pointer cursor, imperative list updates) is unaffected.
 */

export interface AnimationBudgetState {
  allowed: boolean;
  /** Why we're paused, or "" when allowed. */
  reason: string;
  /** Monotonic update counter so subscribers can skip stale snapshots. */
  version: number;
}

type Listener = (state: AnimationBudgetState) => void;

interface AnimationBudgetOptions {
  scrollPauseMs?: number;
  longTaskPauseMs?: number;
  now?: () => number;
  doc?: Document | null;
  win?: Window | null;
}

const DEFAULT_SCROLL_PAUSE_MS = 250;
const DEFAULT_LONG_TASK_PAUSE_MS = 400;

class AnimationBudget {
  private state: AnimationBudgetState = { allowed: true, reason: "", version: 0 };
  private readonly listeners = new Set<Listener>();
  private pauseUntil = 0;
  private reducedMotion = false;
  private hidden = false;
  private readonly scrollPauseMs: number;
  private readonly longTaskPauseMs: number;
  private readonly now: () => number;
  private readonly doc: Document | null;
  private readonly win: Window | null;
  private observer: PerformanceObserver | null = null;
  private removeListeners: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: AnimationBudgetOptions = {}) {
    this.scrollPauseMs = Math.max(0, opts.scrollPauseMs ?? DEFAULT_SCROLL_PAUSE_MS);
    this.longTaskPauseMs = Math.max(
      0,
      opts.longTaskPauseMs ?? DEFAULT_LONG_TASK_PAUSE_MS,
    );
    this.now = opts.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    this.doc = opts.doc ?? (typeof document !== "undefined" ? document : null);
    this.win = opts.win ?? (typeof window !== "undefined" ? window : null);
  }

  start(): void {
    if (this.removeListeners) return;
    const win = this.win;
    const doc = this.doc;
    if (!win) return;

    const mql = win.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (mql) {
      this.reducedMotion = mql.matches;
      const mqlListener = () => {
        this.reducedMotion = mql.matches;
        this.recompute();
      };
      mql.addEventListener?.("change", mqlListener);
      this.removeListeners = () => mql.removeEventListener?.("change", mqlListener);
    } else {
      this.removeListeners = () => {};
    }

    const onScroll = () => {
      this.pauseFor(this.scrollPauseMs, "scroll");
    };
    const onVisibility = () => {
      this.hidden = doc?.visibilityState === "hidden";
      this.recompute();
    };

    win.addEventListener("scroll", onScroll, { passive: true, capture: true });
    doc?.addEventListener("visibilitychange", onVisibility);
    this.hidden = doc?.visibilityState === "hidden";

    const prevRemove = this.removeListeners;
    this.removeListeners = () => {
      prevRemove?.();
      win.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
      doc?.removeEventListener("visibilitychange", onVisibility);
    };

    if (typeof PerformanceObserver !== "undefined") {
      try {
        this.observer = new PerformanceObserver(() => {
          this.pauseFor(this.longTaskPauseMs, "longtask");
        });
        this.observer.observe({ entryTypes: ["longtask"] });
      } catch {
        this.observer = null;
      }
    }

    this.recompute();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.observer?.disconnect();
    this.observer = null;
    this.removeListeners?.();
    this.removeListeners = null;
  }

  /** Same pause duration as window scroll — call from the app shell scroll root. */
  notifyShellScroll(): void {
    this.pauseFor(this.scrollPauseMs, "scroll");
  }

  pauseFor(ms: number, reason: string): void {
    if (ms <= 0) return;
    const until = this.now() + ms;
    if (until > this.pauseUntil) this.pauseUntil = until;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.timer = setTimeout(() => {
      this.pauseUntil = 0;
      this.timer = null;
      this.recompute();
    }, ms);
    this.recompute(reason);
  }

  isAllowed(): boolean {
    return this.state.allowed;
  }

  getState(): AnimationBudgetState {
    return this.state;
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private recompute(overrideReason?: string): void {
    let allowed = true;
    let reason = overrideReason ?? "";
    if (this.reducedMotion) {
      allowed = false;
      reason = "reduced-motion";
    } else if (this.hidden) {
      allowed = false;
      reason = "hidden";
    } else if (this.now() < this.pauseUntil) {
      allowed = false;
      if (!reason) reason = "paused";
    } else {
      reason = "";
    }
    if (allowed === this.state.allowed && reason === this.state.reason) return;
    this.state = { allowed, reason, version: this.state.version + 1 };

    // Mirror onto a body attribute so CSS can drop expensive compositor work
    // (backdrop-filter, box-shadow, transition-all) during scroll/longtask
    // bursts without needing every surface to subscribe explicitly.
    const body = this.doc?.body;
    if (body) {
      if (allowed) body.removeAttribute("data-axtask-calm");
      else body.setAttribute("data-axtask-calm", reason || "paused");
    }
    for (const cb of this.listeners) cb(this.state);
  }
}

let shared: AnimationBudget | null = null;

export function getAnimationBudget(): AnimationBudget {
  if (!shared) shared = new AnimationBudget();
  return shared;
}

/** Start the shared budget exactly once. Safe to call repeatedly. */
export function startSharedAnimationBudget(opts?: AnimationBudgetOptions): void {
  if (!shared) shared = new AnimationBudget(opts);
  shared.start();
}

export function stopSharedAnimationBudget(): void {
  shared?.stop();
  shared = null;
}

export function isAnimationAllowed(): boolean {
  return getAnimationBudget().isAllowed();
}

export function subscribeAnimationBudget(cb: Listener): () => void {
  return getAnimationBudget().subscribe(cb);
}

/** Throttle-friendly hook: main app scroll is on an inner `overflow-y-auto` div, not `window`. */
export function notifyScrollBudget(): void {
  getAnimationBudget().notifyShellScroll();
}

/** For tests — deterministic budget injection. */
export function __setSharedAnimationBudgetForTests(b: AnimationBudget | null): void {
  shared = b;
}

export { AnimationBudget };
