/**
 * use-pretext-surface — set `data-surface="dense|calm"` on the <main> element
 * without re-rendering.
 *
 * The orb/chip layer CSS reads the `[data-surface]` attribute to dim ambient
 * motion over dense operator surfaces (Tasks, Admin, Import/Export, Analytics,
 * Collab Inbox). Pages call `usePretextSurface("dense")` in a useEffect and
 * the attribute is cleared when the component unmounts.
 *
 * The writer is idempotent and DOES NOT use React state, so setting the flag
 * never triggers a tree re-render — aligned with the "minimize React" goal of
 * the visual sweep.
 */
import { useEffect } from "react";

export type PretextSurface = "calm" | "dense";

const SURFACE_ATTR = "data-surface";
const DEFAULT_SURFACE: PretextSurface = "calm";

function resolveMainElement(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const main = document.querySelector("main");
  return main instanceof HTMLElement ? main : null;
}

/**
 * Apply a surface flag for the lifetime of the calling component.
 * Multiple mounted consumers stack: the last mounted consumer wins while it
 * is mounted, and on unmount the previous flag is restored (or the default).
 */
export function usePretextSurface(surface: PretextSurface) {
  useEffect(() => {
    const main = resolveMainElement();
    if (!main) return;
    const previous = main.getAttribute(SURFACE_ATTR);
    main.setAttribute(SURFACE_ATTR, surface);
    return () => {
      if (previous && previous !== surface) {
        main.setAttribute(SURFACE_ATTR, previous);
      } else {
        main.setAttribute(SURFACE_ATTR, DEFAULT_SURFACE);
      }
    };
  }, [surface]);
}
