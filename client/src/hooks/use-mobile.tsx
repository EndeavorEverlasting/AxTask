import * as React from "react"

const MOBILE_BREAKPOINT = 768
/** Wider cap so phone landscape and small touch tablets still get mobile chrome (nav, cards). */
const COARSE_POINTER_MAX_WIDTH = 1024
/** Avoid rapid mobile/desktop flips when the viewport width jitters near the breakpoint (browser chrome). */
const HYSTERESIS_PX = 28
/** Coalesce `resize` storms from mobile dynamic toolbars without delaying real orientation changes (MQL still fires immediately). */
const RESIZE_DEBOUNCE_MS = 180

function readPointerCoarse(): boolean {
  try {
    if (typeof window.matchMedia !== "function") return false
    return window.matchMedia("(pointer: coarse)").matches
  } catch {
    return false
  }
}

function computeMobileSnapshot(w: number, pointerCoarse: boolean): boolean {
  if (w < MOBILE_BREAKPOINT) return true
  if (w >= COARSE_POINTER_MAX_WIDTH) return false
  return pointerCoarse
}

/**
 * Hold the previous mode while width sits in the breakpoint dead zone so
 * address-bar resize noise does not swap the whole shell tree.
 */
function applyHysteresis(w: number, pointerCoarse: boolean, prev: boolean): boolean {
  const lo = MOBILE_BREAKPOINT - HYSTERESIS_PX
  const hi = MOBILE_BREAKPOINT + HYSTERESIS_PX
  if (w >= lo && w < hi) {
    return prev
  }
  return computeMobileSnapshot(w, pointerCoarse)
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)
  const resizeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    const flushResize = () => {
      if (typeof window === "undefined") return
      const w = window.innerWidth
      const coarse = readPointerCoarse()
      setIsMobile((prevStable) => {
        const prevBool = prevStable ?? computeMobileSnapshot(w, coarse)
        return applyHysteresis(w, coarse, prevBool)
      })
    }

    const scheduleResize = () => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      resizeTimerRef.current = setTimeout(() => {
        resizeTimerRef.current = null
        flushResize()
      }, RESIZE_DEBOUNCE_MS)
    }

    let mqlWidth: MediaQueryList | undefined
    let mqlCoarseMax: MediaQueryList | undefined
    try {
      if (typeof window.matchMedia === "function") {
        mqlWidth = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
        mqlCoarseMax = window.matchMedia(
          `(max-width: ${COARSE_POINTER_MAX_WIDTH - 1}px) and (pointer: coarse)`,
        )
      }
    } catch {
      mqlWidth = undefined
      mqlCoarseMax = undefined
    }

    const onMediaImmediate = () => {
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current)
        resizeTimerRef.current = null
      }
      flushResize()
    }

    mqlWidth?.addEventListener("change", onMediaImmediate)
    mqlCoarseMax?.addEventListener("change", onMediaImmediate)
    window.addEventListener("resize", scheduleResize)
    onMediaImmediate()

    return () => {
      mqlWidth?.removeEventListener("change", onMediaImmediate)
      mqlCoarseMax?.removeEventListener("change", onMediaImmediate)
      window.removeEventListener("resize", scheduleResize)
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
    }
  }, [])

  return !!isMobile
}
