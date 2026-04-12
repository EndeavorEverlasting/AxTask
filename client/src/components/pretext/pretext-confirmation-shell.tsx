/**
 * Full-viewport pretext confirmation layout (gradient shell + glass card).
 * Use `PretextGlassCard` alone inside main app chrome when a full bleed shell is not needed.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type PretextAmbientChipsProps = {
  labels: string[];
};

/** Chip positions in viewport %. Each chip wanders and flees the cursor. */
function chipHome(idx: number) {
  return { x: 6 + ((idx * 17) % 80), y: 55 + ((idx * 11) % 30) };
}

export function PretextAmbientChips({ labels }: PretextAmbientChipsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: -1, y: -1 });
  const posRef = useRef(labels.map((_, i) => chipHome(i)));
  const [positions, setPositions] = useState(() => labels.map((_, i) => chipHome(i)));

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = containerRef.current?.getBoundingClientRect();
      if (!r) return;
      mouseRef.current = {
        x: ((e.clientX - r.left) / r.width) * 100,
        y: ((e.clientY - r.top) / r.height) * 100,
      };
    };
    const onLeave = () => { mouseRef.current = { x: -1, y: -1 }; };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseleave", onLeave, { passive: true });

    let last = performance.now();
    let t = 0;
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      t += dt;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const hasMouse = mx >= 0;

      const next = labels.map((_, i) => {
        const home = chipHome(i);
        const driftX = Math.sin(t / (4 + i) + i * 2.1) * 6;
        const driftY = Math.cos(t / (5 + i) + i * 1.7) * 4;
        let repelX = 0;
        let repelY = 0;
        if (hasMouse) {
          const prev = posRef.current[i];
          const dx = prev.x - mx;
          const dy = prev.y - my;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          if (dist < 28) {
            const force = ((28 - dist) / 28) * 22;
            repelX = (dx / dist) * force;
            repelY = (dy / dist) * force;
          }
        }
        const prev = posRef.current[i];
        const tx = home.x + driftX + repelX;
        const ty = home.y + driftY + repelY;
        return {
          x: prev.x + (tx - prev.x) * dt * 2,
          y: prev.y + (ty - prev.y) * dt * 2,
        };
      });
      posRef.current = next;
      setPositions([...next]);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, [labels]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden">
      {labels.map((label, idx) => (
        <motion.div
          key={`${label}-${idx}`}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: [0.5, 0.9, 0.5], scale: [0.92, 1, 0.92] }}
          transition={{ duration: 3.2, delay: 0.15 * idx, repeat: Infinity, ease: "easeInOut" }}
          className="absolute text-xs sm:text-sm rounded-full border border-emerald-300/40 bg-emerald-900/30 backdrop-blur-sm px-3 py-1 text-emerald-200/80 shadow-lg shadow-emerald-500/10"
          style={{
            left: `${positions[idx]?.x ?? 0}%`,
            top: `${positions[idx]?.y ?? 0}%`,
            willChange: "transform",
          }}
        >
          {label}
        </motion.div>
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
