# NodeWeaver Branding and Deployment Modularity

This document captures where NodeWeaver branding assets live and how to keep deployment paths modular during host pivots.

## Branding Asset Paths

- App logo: `static/img/nodeweaver-logo.png`
- Browser favicon: `static/img/favicon.png`
- Base template wiring: `templates/base.html`
- Hero/logo usage: `templates/index.html`
- Logo sizing styles: `static/css/style.css` (`.brand-logo`, `.hero-logo`)

## Swap Procedure (safe)

1. Replace files at the same paths.
2. Keep filenames stable.
3. Verify:
   - navbar/footer/logo render
   - browser favicon updates
   - no static asset 404s

## Runtime Modularity (Host-Agnostic)

NodeWeaver runtime is controlled by env vars:

- `PORT`
- `FLASK_ENV`
- `FLASK_DEBUG`
- `DATABASE_URL`
- `SESSION_SECRET`

This keeps deploy behavior portable across Replit fallback and managed hosts without code rewrites.

## Replit Fallback Readiness

If you must pivot back:

1. Keep Replit deployment available and current.
2. Redirect DNS/traffic to Replit endpoint.
3. Verify health endpoints:
   - `/health`
   - `/api/v1/version`
4. Keep new host running for incident diagnostics.
