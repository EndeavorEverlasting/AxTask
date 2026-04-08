import * as React from "react"

const MOBILE_BREAKPOINT = 768
/** Wider cap so phone landscape and small touch tablets still get mobile chrome (nav, cards). */
const COARSE_POINTER_MAX_WIDTH = 1024

function computeIsMobile(): boolean {
  if (typeof window === "undefined") return false
  const w = window.innerWidth
  if (w < MOBILE_BREAKPOINT) return true
  if (w >= COARSE_POINTER_MAX_WIDTH) return false
  try {
    if (typeof window.matchMedia !== "function") return false
    return window.matchMedia("(pointer: coarse)").matches
  } catch {
    return false
  }
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
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

    const onChange = () => {
      setIsMobile(computeIsMobile())
    }

    mqlWidth?.addEventListener("change", onChange)
    mqlCoarseMax?.addEventListener("change", onChange)
    window.addEventListener("resize", onChange)
    setIsMobile(computeIsMobile())

    return () => {
      mqlWidth?.removeEventListener("change", onChange)
      mqlCoarseMax?.removeEventListener("change", onChange)
      window.removeEventListener("resize", onChange)
    }
  }, [])

  return !!isMobile
}
