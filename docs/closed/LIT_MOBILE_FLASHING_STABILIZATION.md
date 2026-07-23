# LIT: Mobile flashing stabilization

**Status:** Partial implementation preserved; top-bar follow-up tracked in issue #98  
**Incident class:** Mobile-only visual flashing during normal app use  
**Related doc:** `docs/SCROLL_REFRESH_VISUAL_STABILITY.md`

## Plain diagnosis

The reported “shaking” is flashing, not layout jitter.

Desktop is mostly stable because the prior calm-mode fix protects desktop nav and main scroll surfaces. Mobile fixed chrome can still become unstable when translucent glass participates in the calm-mode blur/reader-mask swap while the user scrolls, taps, opens navigation, or triggers route changes.

This is the same family as the earlier scroll/refresh visual stability incident: translucent glass over the Pretext aurora/chip/orb stack becomes unstable when `body[data-axtask-calm]` toggles and CSS removes expensive blur.

## Root cause pattern

Fixed mobile chrome must not use broad glass surfaces over Pretext ambient layers.

Forbidden for fixed nav/chrome:

```tsx
className="... glass-panel-glossy ..."
```

Required for fixed nav/chrome:

```tsx
className="... axtask-nav-chrome ..."
```

`axtask-nav-chrome` is intentionally opaque. It avoids the calm-mode glass color swap, prevents ambient chips/orbs from reading through the nav, and gives mobile surfaces a stable compositing path.

## Preserved implementation

### Mobile bottom nav

File: `client/src/App.tsx`

The mobile bottom nav uses:

```tsx
axtask-nav-chrome
```

rather than `glass-panel-glossy`, and it no longer animates off-screen based on scroll direction.

### Public mobile shell

Unauthenticated pages use `public-scroll-shell` as their actual overflow root. Its scroll activity enters the shared animation budget, and landing-page parallax observes that same container rather than stale window scroll.

### Ambient layers

Coarse-pointer devices avoid cursor-orb and touch-chase work. Ambient chips use transform-based positioning, and mobile landing parallax is reduced.

## Pending follow-up: MobileTopBar

Issue #98 owns the remaining sidebar collision.

File: `client/src/components/layout/sidebar.tsx`

`MobileTopBar` should use `axtask-nav-chrome` rather than `glass-panel-glossy`, and its scroll-direction animation should be removed. That file also contains the newer wallet-query protections:

```tsx
refetchInterval: false
refetchIntervalInBackground: false
```

The stale source file must not be transplanted wholesale because doing so would revive periodic wallet polling.

The follow-up contract should add expectations equivalent to:

```ts
expect(sidebar).toMatch(/MobileTopBar[\s\S]+axtask-nav-chrome/);
expect(sidebar).not.toMatch(/MobileTopBar[\s\S]+glass-panel-glossy/);
```

Those assertions intentionally remain out of the current preserved PR until issue #98 lands the implementation.

## Verification

Current preserved proof:

1. Open `/` at a mobile viewport.
2. Scroll the real `public-scroll-shell` forward and back to the same position.
3. Confirm the footer is reachable.
4. Confirm the same-position viewport remains visually stable after calm mode settles.
5. Confirm the mobile bottom nav contract uses opaque chrome.

Issue #98 later adds authenticated top-bar and wallet-poll preservation proof.

## LIT lesson

Do not make fixed mobile chrome pretty before making it stable.

Pretext can glow behind content. Chrome must behave like steel, and collision repair must not resurrect unrelated resource regressions.
