# LIT: Mobile flashing stabilization

**Status:** Active stabilization note  
**Incident class:** Mobile-only visual flashing during normal app use  
**Related doc:** `docs/SCROLL_REFRESH_VISUAL_STABILITY.md`

## Plain diagnosis

The reported “shaking” is flashing, not layout jitter.

Desktop is mostly stable because the prior calm-mode fix protects desktop nav and main scroll surfaces. Mobile still had fixed chrome surfaces using glossy glass styling, which can participate in the calm-mode blur/reader-mask swap while the user scrolls, taps, opens nav, or triggers route changes.

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

## Immediate fix targets

### 1. Mobile bottom nav

File: `client/src/App.tsx`

The mobile bottom nav must use:

```tsx
axtask-nav-chrome
```

instead of:

```tsx
glass-panel-glossy
```

This change was applied in commit `443ee6d2619a8c19b41f24732495e94e70062c13`.

### 2. Mobile top bar

File: `client/src/components/layout/sidebar.tsx`

`MobileTopBar` must also use `axtask-nav-chrome`, not `glass-panel-glossy`.

Target line pattern:

```tsx
<div className="md:hidden flex items-center justify-between px-4 py-3 glass-panel-glossy rounded-none border-x-0 border-t-0 shrink-0">
```

Replace with:

```tsx
<div className="md:hidden flex items-center justify-between px-4 py-3 axtask-nav-chrome rounded-none border-x-0 border-t-0 shrink-0">
```

## Contract update required

File: `client/src/index.calm-mode.contract.test.ts`

Extend the existing nav chrome test so it guards all mobile chrome surfaces, not just the sidebar and sheet.

Add expectations equivalent to:

```ts
const app = fs.readFileSync(
  path.resolve(__dirname, "App.tsx"),
  "utf8",
);
expect(app).toMatch(/<nav[^>]+axtask-nav-chrome/);

expect(sidebar).toMatch(/MobileTopBar[\s\S]+axtask-nav-chrome/);
expect(sidebar).not.toMatch(/MobileTopBar[\s\S]+glass-panel-glossy/);
```

Cold rule: if mobile fixed chrome uses glass again, the test should fail loudly.

## Manual verification

Use mobile viewport or a real phone.

1. Open AxTask in dark mode.
2. Visit `/planner`, `/tasks`, and `/rewards`.
3. Scroll for 10 to 15 seconds.
4. Tap bottom nav repeatedly between routes.
5. Open and close the mobile sidebar sheet.
6. Watch for brightness pulses, green chip bleed-through, white flashes, or nav color snapping.

Pass condition: mobile top bar, bottom nav, and sheet remain visually steady while content scrolls behind them.

## LIT lesson

Do not make fixed mobile chrome pretty before making it stable.

Pretext can glow behind content. Chrome must behave like steel.
