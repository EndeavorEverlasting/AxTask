/**
 * Full-viewport pretext confirmation layout (gradient shell + glass card).
 * Use `PretextGlassCard` alone inside main app chrome when a full bleed shell is not needed.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { isAnimationAllowed, startSharedAnimationBudget } from "@/lib/animation-budget";
import { flushChipHuntSync } from "@/lib/chip-hunt-sync";

const CHIP_REPEL_OUTER = 28;
const CHIP_REPEL_INNER = 12;
const CHIP_REPEL_INNER_SCALE = 0.38;
const CHIP_CHASE_RADIUS = 28;
const CHIP_CATCH_RADIUS = 11;
const CHIP_CATCH_HOLD_MS = 380;
const CHIP_FLUSH_INTERVAL_MS = 22_000;

export type PretextAmbientChipsProps = {
  labels: string[];
};

/** Chip positions in viewport %. Each chip wanders and flees the cursor. */
function chipHome(idx: number) {
  return { x: 6 + ((idx * 17) % 80), y: 55 + ((idx * 11) % 30) };
}

/**
 * Ambient floating chips that drift and flee the cursor.
 * Uses direct DOM manipulation (no React state) for smooth 60 fps.
 */
export function PretextAmbientChips({ labels }: PretextAmbientChipsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const mouse = { x: -1, y: -1 };
    const pos = labels.map((_, i) => chipHome(i));
    const catchHold = labels.map(() => 0);
    let t = 0;
    let last = performance.now();
    let raf = 0;
    let pendingChaseMs = 0;
    let catchQueued = false;

    startSharedAnimationBudget();

    const setPointerFromClient = (clientX: number, clientY: number) => {
      const r = container.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      mouse.x = ((clientX - r.left) / r.width) * 100;
      mouse.y = ((clientY - r.top) / r.height) * 100;
    };

    const onMove = (e: MouseEvent) => {
      setPointerFromClient(e.clientX, e.clientY);
    };
    const onLeave = () => {
      mouse.x = -1;
      mouse.y = -1;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      setPointerFromClient(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchEnd = () => {
      mouse.x = -1;
      mouse.y = -1;
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseleave", onLeave, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });

    const MAX_MS_PER_REQUEST = 20_000;

    const flush = async () => {
      let guard = 0;
      while ((pendingChaseMs > 0 || catchQueued) && guard++ < 40) {
        const chunk = Math.min(Math.floor(pendingChaseMs), MAX_MS_PER_REQUEST);
        const sendCatch = catchQueued;
        if (chunk <= 0 && !sendCatch) break;
        const ok = await flushChipHuntSync(chunk, sendCatch);
        if (!ok) break;
        if (chunk > 0) pendingChaseMs -= chunk;
        if (sendCatch) catchQueued = false;
      }
    };

    const interval = window.setInterval(() => {
      void flush();
    }, CHIP_FLUSH_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const tick = (now: number) => {
      if (!isAnimationAllowed()) {
        last = now;
        raf = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      t += dt;
      const hasMouse = mouse.x >= 0;

      for (let i = 0; i < labels.length; i++) {
        const home = chipHome(i);
        const driftX = Math.sin(t / (4 + i) + i * 2.1) * 6;
        const driftY = Math.cos(t / (5 + i) + i * 1.7) * 4;
        let repelX = 0;
        let repelY = 0;
        if (hasMouse) {
          const dx = pos[i].x - mouse.x;
          const dy = pos[i].y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          if (dist < CHIP_REPEL_OUTER) {
            let force = ((CHIP_REPEL_OUTER - dist) / CHIP_REPEL_OUTER) * 22;
            if (dist < CHIP_REPEL_INNER) force *= CHIP_REPEL_INNER_SCALE;
            repelX = (dx / dist) * force;
            repelY = (dy / dist) * force;
          }
        }
        const tx = home.x + driftX + repelX;
        const ty = home.y + driftY + repelY;
        pos[i].x += (tx - pos[i].x) * dt * 2;
        pos[i].y += (ty - pos[i].y) * dt * 2;

        const el = chipRefs.current[i];
        if (el) {
          el.style.left = `${pos[i].x}%`;
          el.style.top = `${pos[i].y}%`;
        }
      }

      if (hasMouse) {
        let minDist = Infinity;
        for (let i = 0; i < labels.length; i++) {
          const dx = pos[i].x - mouse.x;
          const dy = pos[i].y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          if (dist < minDist) minDist = dist;
          if (dist < CHIP_CATCH_RADIUS) {
            catchHold[i] += dt * 1000;
          } else {
            catchHold[i] = 0;
          }
        }
        if (minDist < CHIP_CHASE_RADIUS) {
          pendingChaseMs += dt * 1000;
        }
        let bestHold = 0;
        for (let i = 0; i < labels.length; i++) {
          if (catchHold[i] > bestHold) bestHold = catchHold[i];
        }
        if (bestHold >= CHIP_CATCH_HOLD_MS) {
          catchQueued = true;
          for (let i = 0; i < labels.length; i++) catchHold[i] = 0;
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(interval);
      cancelAnimationFrame(raf);
      void flush();
    };
  }, [labels]);

  return (
    <div
      ref={containerRef}
      className="axtask-chip-layer absolute inset-0 pointer-events-none overflow-hidden z-[1]"
      aria-hidden
    >
      {labels.map((label, idx) => (
        <div
          key={`${label}-${idx}`}
          ref={(el) => { chipRefs.current[idx] = el; }}
          className="absolute text-xs sm:text-sm rounded-full border border-emerald-300/40 bg-emerald-900/30 backdrop-blur-sm px-3 py-1 text-emerald-200/80 shadow-lg shadow-emerald-500/10 opacity-70"
          style={{
            left: `${chipHome(idx).x}%`,
            top: `${chipHome(idx).y}%`,
            willChange: "left, top",
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

export type PretextConfirmationShellProps = {
  children: ReactNode;
  /** Ambient chip labels; omit or pass empty to skip chips (when showChips is false). */
  chips?: string[];
  /** When false, chips are not rendered regardless of `chips`. Default true. */
  showChips?: boolean;
};

export function PretextConfirmationShell({
  children,
  chips = [],
  showChips = true,
}: PretextConfirmationShellProps) {
  const renderChips = showChips && chips.length > 0;
  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
      {/* Aurora glow layers */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-1/4 left-1/3 h-[50vh] w-[70vw] rotate-6 rounded-full bg-gradient-to-r from-emerald-600/8 via-cyan-500/6 to-transparent blur-[100px]" />
        <div className="absolute -bottom-1/4 right-1/4 h-[40vh] w-[60vw] -rotate-12 rounded-full bg-gradient-to-l from-violet-600/8 via-indigo-500/6 to-transparent blur-[80px]" />
      </div>
      {renderChips ? <PretextAmbientChips labels={chips} /> : null}
      <div className="mx-auto max-w-2xl px-6 py-16 sm:py-24 relative z-10">{children}</div>
    </div>
  );
}

const glassCardBase =
  "rounded-2xl border border-white/15 bg-white/10 backdrop-blur p-7 sm:p-10 shadow-2xl";

export type PretextGlassCardProps = {
  children: ReactNode;
  className?: string;
};

export function PretextGlassCard({ children, className }: PretextGlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={cn(glassCardBase, className)}
    >
      {children}
    </motion.div>
  );
}

/** Gradient + shadow for primary CTAs; pair with `h-12` and width (`w-full`, `px-6`, etc.) at call sites. */
export const pretextGradientCtaClassName =
  "rounded-xl bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300 text-slate-900 hover:brightness-105 font-semibold shadow-lg disabled:opacity-60";
