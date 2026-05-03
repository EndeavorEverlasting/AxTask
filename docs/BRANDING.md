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

## Glossy Pretext System (visual brand)

Every authenticated page in AxTask renders through the **Pretext shell**, a single-mount background rig that owns the aurora body, cursor-reactive orbs, and ambient chip layer so route changes don't re-mount those effects. Branding anywhere inside the app should layer on top of this system rather than fight it.

Core primitives and tokens:

- `PretextShell` (`client/src/components/pretext/pretext-shell.tsx`) — mounted once in `AuthenticatedApp` (and individually on unauthenticated surfaces like `/login`, `/landing`, `/contact`). Renders the `.axtask-aurora-body` gradient, `CursorOrbsBackdrop`, and `PretextAmbientChips`. Do not duplicate these layers on individual pages.
- `PretextPageHeader` (`client/src/components/pretext/pretext-page-header.tsx`) — canonical header block for in-app pages. Uses `.glass-panel-glossy` and exposes `eyebrow / title / subtitle / chips / actions / children` slots. New pages MUST use this instead of bespoke `<div><h1>` headers.
- `AvatarOrb` (`client/src/components/ui/avatar-orb.tsx`) — the only supported way to render companion avatars. See `docs/ORB_AVATAR_EXPERIENCE_CONTRACT.md` for the glossy orb contract.
- `.glass-panel` vs `.glass-panel-glossy` (in `client/src/index.css`) — `.glass-panel` is the base translucent card; `.glass-panel-glossy` adds the specular top sheen used for hero surfaces, page headers, and dialogs. Pick glossy for statement surfaces, plain glass for dense clusters.
- `data-surface="dense"` — opt in on pages where background motion distracts (see contract doc). The default `calm` treatment is what branding screenshots should use.

Theme default:

- The app is **dark-first**. `client/index.html` pre-applies the `dark` class before hydration to avoid FOUC, and `ThemeProvider` defaults to `dark` with an opt-in `light` variant behind the theme toggle. Marketing assets and screenshots should favor the dark treatment unless the light variant is explicitly being demonstrated.

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
