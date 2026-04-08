/**
 * Full-viewport pretext confirmation layout (gradient shell + glass card).
 * Use `PretextGlassCard` alone inside main app chrome when a full bleed shell is not needed.
 */
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type PretextAmbientChipsProps = {
  labels: string[];
};

export function PretextAmbientChips({ labels }: PretextAmbientChipsProps) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {labels.map((label, idx) => (
        <motion.div
          key={`${label}-${idx}`}
          initial={{ opacity: 0, y: 16, x: (idx % 2 === 0 ? -1 : 1) * 30, scale: 0.9 }}
          animate={{ opacity: [0, 1, 0], y: [-8, -32, -50], x: [0, (idx % 2 === 0 ? -1 : 1) * 12, 0], scale: [0.9, 1, 0.98] }}
          transition={{ duration: 1.8, delay: 0.08 * idx, repeat: Infinity, repeatDelay: 0.6 }}
          className="absolute text-xs sm:text-sm rounded-full border border-emerald-300/50 bg-emerald-50/80 px-3 py-1 text-emerald-700"
          style={{ left: `${10 + (idx * 14) % 75}%`, top: `${56 + (idx * 9) % 28}%` }}
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
      {renderChips ? <PretextAmbientChips labels={chips} /> : null}
      <div className="mx-auto max-w-2xl px-6 py-16 sm:py-24 relative">{children}</div>
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
