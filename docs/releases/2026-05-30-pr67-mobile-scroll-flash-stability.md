# PR #67: Mobile scroll and flash stability

Date: 2026-05-30

## Summary

- Public pages (landing, login, contact, privacy, terms, deep-link gate) now
  render inside a dedicated `public-scroll-shell` so they scroll correctly on
  mobile despite `#root { overflow: hidden }`.
- Public route selection uses the query-stripped `pathOnly`, so deep links such
  as `/login?mode=register` and `/login?next=/tasks` resolve to `LoginPage`
  instead of falling through to the landing or deep-link-gate fallback.
- The public scroll shell now calls `notifyScrollBudget()` via a throttled
  `onScroll` handler so calm-mode engages during mobile momentum scroll on
  unauthenticated pages.
- Mobile bottom nav and `MobileTopBar` switched from `glass-panel-glossy`
  hide-on-scroll behavior to opaque `axtask-nav-chrome`. The `useScrollDirection`
  hook is no longer consumed by either surface.
- Pretext ambient chips: deterministic origin (`left: 0; top: 0; transform: translate3d(...)`)
  with `willChange: transform`, and `touchmove` chip-chasing is disabled on
  coarse pointers by design.
- `CursorOrbsBackdrop` bails out of its rAF loop entirely on coarse pointers.
- Landing-page parallax range is clamped to `[0, 0]` on viewports `< 768px`.

## Tests

- `tests/ui/mobile-landing-scroll.spec.ts` (real-app iPhone-14 viewport;
  uses `toBeInViewport()` to prove the footer was actually scrolled to).
- `tests/ui/mobile-scroll-stability.spec.ts` (synthetic shell; baseline and
  post-reversal screenshots taken at the same `scrollTop=100` so any diff
  reflects a reversal flash, not normal content movement; threshold tightened
  to `< 1%`).
- `client/src/index.calm-mode.contract.test.ts` extended to assert
  `MobileTopBar` uses `axtask-nav-chrome` and never `glass-panel-glossy`.

## Database

No database shape changes.

## Validation

- `npm run check`
- `npm run release:check`
- `npm run test:ui:mobile-stability`
- `npm run test:ui:auth-surfaces`
- `npm run test:ui:planner-scroll`
- `npm run test:deploy:regression`
- `npm run build`
