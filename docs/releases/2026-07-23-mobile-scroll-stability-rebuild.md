# Mobile Scroll Stability Rebuild

**Date:** 2026-07-23  
**Source:** safe unique work preserved from stale PR #67

## Delivered

- unauthenticated pages render inside a mobile-scrollable public shell;
- public-shell scrolling participates in the shared animation budget;
- the mobile bottom navigation remains fixed rather than animating off-screen by scroll direction;
- heavy cursor-orb work is skipped for coarse pointers;
- ambient-chip movement uses transform-based positioning and avoids touch-scroll chasing;
- landing-page motion is reduced on mobile;
- calm-mode contracts cover the stable navigation classes;
- the existing Playwright planner-scroll gate now also proves mobile landing reachability and bounded direction-reversal visual diff.

## Deliberate separation

The source PR also changed `MobileTopBar` in `sidebar.tsx`. That file later gained the merged wallet-polling resource-control fix. The old whole-file blob was not applied. The remaining top-bar hunk is preserved with exact acceptance criteria in issue #98.

## Validation

Typecheck, full tests, release contract, production build, existing planner/mobile Playwright gate, bundle budget, API replay, and disposable migration/schema checks.

## Rollback

Revert the six preserved application/contract files, the Playwright gate extension, the historical LIT note, and this release record. No database rollback is required.

## Proof ceiling

Repository and browser-harness proof do not establish every physical mobile device, production deployment, or the still-open top-bar follow-up in issue #98.
