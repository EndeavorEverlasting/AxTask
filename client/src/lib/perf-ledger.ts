/**
 * PerfLedger — tiny, rAF-batched ring buffer that any UI surface can write to
 * to report how long it spent on the main thread.
 *
 * Design goals:
 *  - Zero React state, zero per-mark allocations on the hot path (one typed
 *    array slot per mark, reused circularly).
 *  - Safe to call from imperative (non-React) code as well as React hooks —
 *    see `use-perf-surface.ts`.
 *  - Snapshot shape is precomputed per subscriber tick (default 1 Hz), so
 *    admin UIs can read without re-aggregating every frame.
 *
 * Surfaces are keyed by a short string (e.g. `task-list`, `admin-storage`).
 * Each mark is tagged with one of:
 *   - `mount`    — first render of a surface instance
 *   - `render`   — a normal React render pass
 *   - `update`   — an imperative controller update pass
 *   - `longtask` — a >=50ms main-thread task attributed to this surface
 *
 * The ledger is **purely client-local**. Nothing is persisted or sent to the
 * server — mirrors the `ClientPerfPanel` doctrine (spot-check only).
 */

export type PerfMarkKind = "mount" | "render" | "update" | "longtask";

export interface PerfMark {
  surface: string;
  kind: PerfMarkKind;
  durMs: number;
  /** `performance.now()` at the end of the measured interval. */
  t: number;
  /** Optional row count for list surfaces. */
  rowCount?: number;
}

export interface PerfSurfaceRow {
  surface: string;
  mounts: number;
  renders: number;
  updates: number;
  longtasks: number;
  totalMs: number;
  longtaskMs: number;
  p50Ms: number;
  p95Ms: number;
  maxRowCount: number;
}

export interface PerfLedgerSnapshot {
  capturedAt: number;
  windowMs: number;
  totalMarks: number;
  rows: PerfSurfaceRow[];
}

export interface PerfLedgerOptions {
  /** Ring buffer capacity in entries. Defaults to 4096. */
  capacity?: number;
  /** Rolling window length for snapshots in ms. Defaults to 120_000 (2 min). */
  windowMs?: number;
  /** `performance.now()` provider (override for tests). */
  now?: () => number;
}

type Subscriber = (snapshot: PerfLedgerSnapshot) => void;

const DEFAULT_CAPACITY = 4096;
const DEFAULT_WINDOW_MS = 120_000;

function quickPercentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx]!;
}

export class PerfLedger {
  private readonly capacity: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  private readonly surfaces: string[];
  private readonly kinds: Uint8Array;
  private readonly durs: Float32Array;
  private readonly times: Float64Array;
  private readonly rowCounts: Int32Array;

  private writeIdx = 0;
  private size = 0;
  private totalWrites = 0;

  private readonly subscribers = new Set<Subscriber>();

  constructor(opts: PerfLedgerOptions = {}) {
    this.capacity = Math.max(1, opts.capacity ?? DEFAULT_CAPACITY);
    this.windowMs = Math.max(1, opts.windowMs ?? DEFAULT_WINDOW_MS);
    this.now =
      opts.now ??
      (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));

    this.surfaces = new Array<string>(this.capacity).fill("");
    this.kinds = new Uint8Array(this.capacity);
    this.durs = new Float32Array(this.capacity);
    this.times = new Float64Array(this.capacity);
    this.rowCounts = new Int32Array(this.capacity);
  }

  mark(
    surface: string,
    kind: PerfMarkKind,
    durMs: number,
    rowCount?: number,
  ): void {
    if (!surface) return;
    if (!Number.isFinite(durMs) || durMs < 0) return;

    const slot = this.writeIdx;
    this.surfaces[slot] = surface;
    this.kinds[slot] = kindToCode(kind);
    this.durs[slot] = durMs;
    this.times[slot] = this.now();
    this.rowCounts[slot] = typeof rowCount === "number" && rowCount >= 0 ? rowCount : -1;

    this.writeIdx = (this.writeIdx + 1) % this.capacity;
    if (this.size < this.capacity) this.size += 1;
    this.totalWrites += 1;
  }

  snapshot(): PerfLedgerSnapshot {
    const capturedAt = this.now();
    const cutoff = capturedAt - this.windowMs;

    const perSurface = new Map<
      string,
      {
        mounts: number;
        renders: number;
        updates: number;
        longtasks: number;
        totalMs: number;
        longtaskMs: number;
        durs: number[];
        maxRowCount: number;
      }
    >();

    for (let i = 0; i < this.size; i++) {
      const slot = (this.writeIdx - 1 - i + this.capacity) % this.capacity;
      const t = this.times[slot]!;
      if (t < cutoff) break;
      const surface = this.surfaces[slot]!;
      if (!surface) continue;
      let row = perSurface.get(surface);
      if (!row) {
        row = {
          mounts: 0,
          renders: 0,
          updates: 0,
          longtasks: 0,
          totalMs: 0,
          longtaskMs: 0,
          durs: [],
          maxRowCount: 0,
        };
        perSurface.set(surface, row);
      }
      const kind = codeToKind(this.kinds[slot]!);
      const dur = this.durs[slot]!;
      const rowCount = this.rowCounts[slot]!;

      if (kind === "mount") row.mounts += 1;
      else if (kind === "render") row.renders += 1;
      else if (kind === "update") row.updates += 1;
      else if (kind === "longtask") {
        row.longtasks += 1;
        row.longtaskMs += dur;
      }
      row.totalMs += dur;
      row.durs.push(dur);
      if (rowCount >= 0 && rowCount > row.maxRowCount) row.maxRowCount = rowCount;
    }

    const rows: PerfSurfaceRow[] = [];
    for (const [surface, agg] of perSurface) {
      rows.push({
        surface,
        mounts: agg.mounts,
        renders: agg.renders,
        updates: agg.updates,
        longtasks: agg.longtasks,
        totalMs: Math.round(agg.totalMs * 100) / 100,
        longtaskMs: Math.round(agg.longtaskMs * 100) / 100,
        p50Ms: Math.round(quickPercentile(agg.durs, 50) * 100) / 100,
        p95Ms: Math.round(quickPercentile(agg.durs, 95) * 100) / 100,
        maxRowCount: agg.maxRowCount,
      });
    }
    rows.sort((a, b) => b.totalMs - a.totalMs);

    return {
      capturedAt,
      windowMs: this.windowMs,
      totalMarks: this.totalWrites,
      rows,
    };
  }

  subscribe(cb: Subscriber): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  notifySubscribers(): void {
    if (this.subscribers.size === 0) return;
    const snap = this.snapshot();
    for (const cb of this.subscribers) cb(snap);
  }

  reset(): void {
    this.writeIdx = 0;
    this.size = 0;
    this.totalWrites = 0;
    this.surfaces.fill("");
    this.kinds.fill(0);
    this.durs.fill(0);
    this.times.fill(0);
    this.rowCounts.fill(0);
  }

  /** For tests. */
  getSize(): number {
    return this.size;
  }
}

function kindToCode(kind: PerfMarkKind): number {
  switch (kind) {
    case "mount":
      return 1;
    case "render":
      return 2;
    case "update":
      return 3;
    case "longtask":
      return 4;
    default:
      return 0;
  }
}

function codeToKind(code: number): PerfMarkKind {
  switch (code) {
    case 1:
      return "mount";
    case 2:
      return "render";
    case 3:
      return "update";
    case 4:
      return "longtask";
    default:
      return "render";
  }
}

let sharedLedger: PerfLedger | null = null;

/** Global accessor used by hooks / imperative controllers / the admin panel. */
export function perfLedger(): PerfLedger {
  if (!sharedLedger) sharedLedger = new PerfLedger();
  return sharedLedger;
}

/** For tests — swap in a deterministic ledger. */
export function __setSharedPerfLedgerForTests(ledger: PerfLedger | null): void {
  sharedLedger = ledger;
}
