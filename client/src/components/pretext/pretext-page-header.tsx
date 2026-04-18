/**
 * PretextPageHeader — shared glossy page header used by every app page.
 *
 * Replaces the ad-hoc `<GlassPanel elevated><h2>…</h2><p>…</p></GlassPanel>`
 * pattern that was duplicated across pages. Provides:
 *   - Title (required) + optional eyebrow + subtitle.
 *   - Optional chips row (uses `FloatingChip` tones, not the rAF ambient chips
 *     which are already mounted by PretextShell behind the page).
 *   - Optional right-aligned actions slot (buttons, toggles).
 *   - Optional `children` for extra content below the title block
 *     (`ImmersivePretextCue`, sync meta, etc.).
 *
 * Uses the `.glass-panel-glossy` variant so every header carries the same
 * specular highlight + rim and reads correctly against the aurora.
 */
import { memo, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PretextPageHeaderProps = {
  /** Small uppercase eyebrow rendered above the title (e.g. "Dashboard"). */
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Chips row rendered above the title block. */
  chips?: ReactNode;
  /** Right-side actions (buttons, toggles). Stacks below on small screens. */
  actions?: ReactNode;
  /** Extra content rendered below the title block inside the same glass card. */
  children?: ReactNode;
  className?: string;
};

function PretextPageHeaderImpl({
  eyebrow,
  title,
  subtitle,
  chips,
  actions,
  children,
  className,
}: PretextPageHeaderProps) {
  return (
    <header
      className={cn(
        "glass-panel-glossy rounded-2xl p-4 md:p-6 space-y-3",
        className,
      )}
    >
      {chips ? <div className="flex flex-wrap gap-2">{chips}</div> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">
            {title}
          </h1>
          {subtitle ? (
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </header>
  );
}

export const PretextPageHeader = memo(PretextPageHeaderImpl);
PretextPageHeader.displayName = "PretextPageHeader";
