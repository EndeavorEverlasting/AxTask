# AxTask Branding and Fallback Modularity

This document defines where branding assets live and how to keep deployment fallback modularity intact.

## Branding Asset Paths

- Sidebar/app logo: `client/public/branding/axtask-logo.png`
- Browser favicon: `client/public/favicon.png`
- HTML head wiring: `client/index.html`
- Sidebar wiring: `client/src/components/layout/sidebar.tsx`

## Swap Procedure (safe)

1. Replace logo files at the same paths.
2. Keep filenames stable to avoid code changes.
3. Verify:
   - sidebar logo renders
   - tab icon updates
   - no 404s for `/branding/axtask-logo.png` or `/favicon.png`

## Local Staging Artifacts

- Use `pics/` only as a local staging folder.
- `pics/` is git-ignored and should not be deployed.

## Fallback Modularity Contract (Replit + New Host)

The app is intentionally environment-driven so you can pivot between hosts without rewriting app logic.

Required controls:

- `CANONICAL_HOST` = preferred primary domain
- `REPLIT_FALLBACK_HOST` = live Replit app domain kept ready for rollback
- `FORCE_HTTPS` = HTTPS redirect behavior
- `ADDITIONAL_ALLOWED_HOSTS` = temporary host allowlist (comma-separated)
- `ADDITIONAL_ALLOWED_ORIGINS` = temporary origin allowlist (comma-separated)

Behavior summary:

- Unknown hosts are redirected to `CANONICAL_HOST` (if set).
- Replit fallback host remains accepted for immediate failback.
- API origin checks are allowlist-driven, not hardcoded to one platform.
- Health/readiness endpoints remain available for cutover automation:
  - `/health`
  - `/ready`

## Pivot to Replit (Emergency)

1. Keep Replit deployment warm and secrets current.
2. Point DNS back to Replit target.
3. Verify `/health` and `/ready`.
4. Keep new host up for diagnostics; do not delete until stable.
