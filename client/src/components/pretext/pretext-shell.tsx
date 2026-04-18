/**
 * PretextShell — single-mount global shell for the Pretext-centric visual
 * system. Rendered ONCE at the top of AuthenticatedApp (and reused by the
 * landing/login routes) so the orb rAF loops, pointer listeners, and ambient
 * chip drift state never re-mount across wouter route changes.
 *
 * Layers (back-to-front):
 *   1. Fixed `.axtask-aurora-body` base wash (CSS-only, honors .dark/.light).
 *   2. `CursorOrbsBackdrop` — rAF-driven gradient orbs with cursor-repel.
 *   3. Optional `PretextAmbientChips` — fleeting-task chips that scatter.
 *   4. `children` on top at z-10.
 *
 * Density control:
 *   Pages set `data-surface="dense"` or `data-surface="calm"` on their root
 *   element (we default main to "calm"). CSS dims the orb/chip layers on
 *   dense surfaces without remounting anything. See
 *   [docs/ORB_AVATAR_EXPERIENCE_CONTRACT.md] for doctrine.
 */
import { memo, type ReactNode } from "react";
import { CursorOrbsBackdrop } from "@/components/marketing/cursor-orbs-backdrop";
import { PretextAmbientChips } from "@/components/pretext/pretext-confirmation-shell";

export const PRETEXT_DEFAULT_CHIP_LABELS = [
  "Focus",
  "Flow",
  "Ship",
  "Rest",
  "Repeat",
  "Done",
] as const;

export type PretextShellProps = {
  children: ReactNode;
  /** Chip labels; pass an empty array or `showChips={false}` to disable chips. */
  chips?: readonly string[];
  showChips?: boolean;
  /** Container className appended to the root. Use for layout (flex/height). */
  className?: string;
};

/**
 * Memoized so route-level re-renders of authenticated children do not
 * re-invoke the orb/chip mount. The rAF loops run uninterrupted.
 */
function PretextShellImpl({
  children,
  chips = PRETEXT_DEFAULT_CHIP_LABELS,
  showChips = true,
  className,
}: PretextShellProps) {
  return (
    <div className={className}>
      {/* Fixed aurora + orbs sit behind everything. Both layers are
       * pointer-events:none so page chrome (sidebar resize, buttons,
       * selection) remains fully interactive. */}
      <div className="axtask-aurora-body" aria-hidden />
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <CursorOrbsBackdrop />
        {showChips && chips.length > 0 ? (
          <PretextAmbientChips labels={[...chips]} />
        ) : null}
      </div>
      {children}
    </div>
  );
}

export const PretextShell = memo(PretextShellImpl);
PretextShell.displayName = "PretextShell";
