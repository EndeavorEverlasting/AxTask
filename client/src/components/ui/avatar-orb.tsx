/**
 * AvatarOrb — glossy circular orb used for companion avatars across the app.
 *
 * The five variants (`mood`, `archetype`, `productivity`, `social`, `lazy`)
 * mirror the five companion keys in
 * [shared/feedback-avatar-map.ts](../../../../shared/feedback-avatar-map.ts)
 * and honor the mood-color contract in
 * [docs/ORB_AVATAR_EXPERIENCE_CONTRACT.md](../../../../docs/ORB_AVATAR_EXPERIENCE_CONTRACT.md).
 *
 * Rendering is pure CSS (no rAF, no JS state) — the `.axtask-orb` class
 * stacks three radial gradients (specular highlight, dark bottom tuck, hue
 * body) plus two pseudo-elements (::before top-left gloss, ::after rim
 * shadow). Add `.axtask-orb-wobble` for the ambient float animation; omit it
 * for static contexts like table rows.
 */
import { memo, type ReactNode } from "react";
import type { FeedbackAvatarKey } from "@shared/feedback-avatar-map";
import { cn } from "@/lib/utils";

export type AvatarOrbVariant = FeedbackAvatarKey;

export type AvatarOrbSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_CLASS: Record<AvatarOrbSize, string> = {
  xs: "h-6 w-6 text-[9px]",
  sm: "h-8 w-8 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-14 w-14 text-sm",
  xl: "h-20 w-20 text-base",
};

const VARIANT_CLASS: Record<AvatarOrbVariant, string> = {
  mood: "axtask-orb-mood",
  archetype: "axtask-orb-archetype",
  productivity: "axtask-orb-productivity",
  social: "axtask-orb-social",
  lazy: "axtask-orb-lazy",
};

export type AvatarOrbProps = {
  variant: AvatarOrbVariant;
  size?: AvatarOrbSize;
  /** Wobble animation. Default on for headers/dialogs, off in dense rows. */
  wobble?: boolean;
  /** Content rendered inside the orb (initials, icon). */
  children?: ReactNode;
  /** Accessible label; omit when the orb is decorative only. */
  label?: string;
  className?: string;
};

function AvatarOrbImpl({
  variant,
  size = "md",
  wobble = true,
  children,
  label,
  className,
}: AvatarOrbProps) {
  const a11y = label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": true as const };
  return (
    <span
      {...a11y}
      className={cn(
        "axtask-orb",
        VARIANT_CLASS[variant],
        wobble && "axtask-orb-wobble",
        SIZE_CLASS[size],
        "font-semibold text-white drop-shadow-sm",
        className,
      )}
    >
      {children}
    </span>
  );
}

export const AvatarOrb = memo(AvatarOrbImpl);
AvatarOrb.displayName = "AvatarOrb";
