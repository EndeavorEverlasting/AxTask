# AxTask — Priority Engine Task Management System

## Overview
AxTask is a full-stack intelligent task management application designed to automate task prioritization. It uses an advanced scoring engine that analyzes task content, keywords, tags, and other factors to assign priorities, thereby reducing manual effort and enhancing task organization. The project aims to provide a professional, secure, and highly functional task management solution with a clean user experience.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application uses React 18 with TypeScript, `shadcn/ui` (built on Radix UI), and Tailwind CSS for styling. It features a fully mobile-responsive design, adapting layout and components for smaller screens. Advanced accessibility features include a dynamic focus glow system, auto-focus for quick entry, improved button labels, full keyboard navigation, and UI scale control.

### Technical Implementations
The frontend utilizes TanStack Query for state management, Wouter for routing, and React Hook Form with Zod for form handling. The backend runs on Node.js with Express.js (TypeScript, ES modules). PostgreSQL with Drizzle ORM is used for the database, and the API is RESTful with JSON responses. Session management is handled by PostgreSQL-backed storage. Both client and server-side validation are enforced with Zod schemas.

Key features include:
-   **Priority Engine**: An intelligent algorithm factoring in urgency, impact, effort, keywords, tags, deadlines, and crisis detection.
-   **Calendar Views**: Interactive task management with drag-and-drop rescheduling across multiple time-based views.
-   **Import/Export System**: Bulk Excel/CSV import and export with server-side batch processing.
-   **Print Checklist & OCR**: Generates printable PDF checklists and allows OCR scanning of completed checklists for automated task status updates.
-   **AI Planner Agent**: An intelligent planning panel offering daily briefings, recommended tasks with priority reasoning, weekly mini-calendars, and a conversational Q&A interface.
-   **Analytics Dashboard**: Provides visual insights into task metrics.
-   **Real-time Updates**: Achieved through optimistic updates and cache invalidation.
-   **Task Search**: Full-text search with debounce.
-   **Performance Optimizations**: Includes `React.memo`, debouncing, SQL aggregate queries, bulk updates, and database indexing.
-   **Animations**: Uses `framer-motion` for various UI animations, respecting `prefers-reduced-motion`.
-   **Voice Input**: Browser-native Web Speech API for dictating task activity and notes, including voice commands for task attributes.
-   **Universal Voice Command System**: A global voice command bar (Ctrl+M) with server-side dispatching to classify intent (task creation, planner query, calendar command, navigation, search, task review) and process commands through dedicated engines.
-   **Immersive Mobile Voice Overlay**: Full-screen mobile voice experience with animated waveform bars, large mic button with ripple effects, intent-branded result cards, swipe-down-to-close gesture, auto-start listening, and full accessibility (dialog role, aria labels, focus management, reduced motion respect). Desktop retains the compact command bar.
-   **Task Review Engine**: Voice/text-driven bulk task management with natural language parsing to process user feedback on recommended tasks and generate structured proposals for approval.
-   **Gamification (AxCoins)**: A currency and rewards system with coin earning (priority-based amounts, on-time bonuses, streak multipliers), achievement badges, a Rewards Shop, and transaction history.
-   **Classification Rewards & Compound Interest**: Users earn AxCoins for classifying tasks, with additional coins earned for confirmations from other users and compound interest.
-   **Data Migration Toolkit**: Full database export/import with referential integrity validation, including an admin UI and user self-service options for GDPR data portability.
-   **Task Recurrence**: Tasks can be configured with various recurrence schedules (daily, weekly, monthly, etc.) plus custom day-of-week (`custom:days:mon,wed,fri`) and day-of-month (`custom:dates:1,15`) patterns via an interactive picker UI.
-   **Cleanup Bonus**: Users earn 4 AxCoins for meaningful updates to pending tasks older than 7 days (once per task). Stats shown on Rewards Profile tab.
-   **Proactive Field Glow Warnings**: Visual cues (yellow glow) for empty required fields in forms, clearing upon input.
-   **Universal Glow System**: Five CSS glow classes (`field-glow-hint`, `field-glow-warning`, `field-glow-success`, `field-glow-tutorial`, `field-glow-tutorial-success`) for various UI feedback and tutorial purposes.
-   **Interactive Tutorial**: A 14-step guided walkthrough covering key application features, utilizing the universal glow system.
-   **Real-time Collaboration**: Google Drive-style collaborative task editing via WebSocket, including task sharing with role-based permissions, live presence indicators, and real-time field edit broadcasting.
-   **Collaboration Rewards**: Users earn AxCoins for sharing tasks and completing collaborative tasks, including collaboration-specific badges.
-   **Coin Economy (Spend & Scarcity)**: Consumable coin sinks such as Streak Shields, Priority Boost, Task Bounties, and Coin Gifting to create ongoing demand for AxCoins.
-   **Pattern Learning Engine**: RAG-style intelligence that learns from user task history to detect topics, recurring tasks, deadline rhythms, and suggest deadlines.

### Authentication & Security
The system features multi-tier authentication supporting Google OAuth, Replit OIDC, WorkOS AuthKit (enterprise SSO), and a hardened local email/password strategy using bcrypt. Security measures include account lockout, user banning, robust password policies, input validation, security questions, hashed password reset tokens, a Security Admin UI, rate limiting, comprehensive security audit logging, request size limits, session security with httpOnly cookies, and enforced HTTPS with HSTS and CSP in production.

### Database Schema
Key tables include `users`, `password_reset_tokens`, `security_logs`, `tasks`, `task_collaborators`, `task_patterns`, `classification_contributions`, and `classification_confirmations`. Sessions are managed by `connect-pg-simple`.

## External Dependencies

### Authentication
-   **Passport.js**: Authentication middleware.
-   **bcrypt**: Password hashing.
-   **express-session**, **connect-pg-simple**: PostgreSQL-backed sessions.
-   **express-rate-limit**: Rate limiting.
-   **helmet**: Security headers.

### Database
-   **PostgreSQL**: Replit Helium database.
-   **Drizzle ORM**: Type-safe ORM.

### Google Integration
-   **Google Sheets API**: For task import/export.
-   **googleapis**: Google API client.

### UI Libraries
-   **Radix UI**: Headless UI components.
-   **Lucide React**: Icons.
-   **Recharts**: Data visualization.
-   **date-fns**: Date manipulation.

### File Processing
-   **Papa Parse**: CSV processing.
-   **xlsx**: Excel file processing.
-   **pdfkit**: PDF generation.
-   **multer**: File uploads.
-   **Tesseract.js**: OCR engine.

### Development
-   **Vite**: Frontend build tool.
-   **esbuild**: Backend bundling.
-   **TypeScript**: Language.
-   **Tailwind CSS**: Styling framework.
-   **Vitest**: Testing framework.
-   **cross-env**: Cross-platform environment variables.

---

## Build, Deploy & Publish Reference

This section is the authoritative reference for building, deploying, and publishing AxTask. Any AI agent working on this project MUST read this section before making changes that affect the build or deployment pipeline.

### Build Pipeline (What Happens When You Run `npm run build`)

The build command is: `vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist`

**Step 1: Vite builds the frontend**
- Source: `client/` directory (root set in `vite.config.ts`)
- Output: `dist/public/` (index.html, CSS bundle, JS bundle)
- Aliases resolved: `@/` → `client/src/`, `@shared/` → `shared/`, `@assets/` → `attached_assets/`
- React plugin handles JSX transform (no explicit React import needed)

**Step 2: esbuild bundles the backend**
- Source: `server/index.ts` (single entry point)
- Output: `dist/index.js` (ESM format, ~262KB)
- `--packages=external` means node_modules are NOT bundled — they're imported at runtime from `node_modules/`
- `--platform=node` targets Node.js

**Build outputs that MUST exist after successful build:**
- `dist/index.js` — Backend entry point (should be >100KB)
- `dist/public/index.html` — SPA entry point
- `dist/public/assets/index-*.css` — CSS bundle
- `dist/public/assets/index-*.js` — JS bundle (~1.4MB)

### Development vs Production Server

| Aspect | Development (`npm run dev`) | Production (`npm run start`) |
|--------|---------------------------|------------------------------|
| Command | `cross-env NODE_ENV=development tsx server/index.ts` | `cross-env NODE_ENV=production node dist/index.js` |
| Frontend | Vite dev server (HMR, no build needed) | Static files from `dist/public/` |
| Backend | `tsx` runs TypeScript directly | `node` runs bundled `dist/index.js` |
| Port | `PORT` env var or 5000 | `PORT` env var (Cloud Run sets this) or 5000 |
| Helmet/CSP | Disabled (`isDev = true`) | Full CSP, HSTS, HTTPS enforcement |
| HTTPS redirect | No | Yes — redirects HTTP→HTTPS, skips localhost |
| Dev accounts | Seeded on every restart | Not seeded |

### Deployment Configuration

**Target:** Replit Autoscale (Cloud Run)
**`.replit` deployment section:**
```toml
[deployment]
deploymentTarget = "autoscale"
build = ["npm", "run", "build"]
run = ["npm", "run", "start"]
```

### Port Configuration (CRITICAL)

- **Development**: `PORT=5000` is set in `[userenv.development]` in `.replit`. Only applies to dev environment.
- **Production**: Cloud Run sets its own `PORT` env var (typically 8080). The server reads `process.env.PORT` and falls back to 5000 only if unset.
- **NEVER set PORT in shared or production env vars.** Cloud Run must control this. A shared `PORT=5000` overrides Cloud Run's port and causes deployment failures.
- The `.replit` `[env]` section may show `PORT = "5000"` — this is a legacy entry. The actual env var management is in `[userenv.development]`.

### HTTPS Redirect Behavior (CRITICAL for testing)

In production (`NODE_ENV=production`), the server (`server/index.ts` lines 50-67):
1. Skips redirect for `localhost` and `127.0.0.1` — allows local smoke testing
2. Checks `x-forwarded-proto` header first (Cloud Run terminates TLS at load balancer and sends this header)
3. Falls back to `req.protocol` check
4. Redirects non-canonical hostnames to `axtask.replit.app`

**Why this matters:** When smoke-testing the production build locally (`PORT=9876 NODE_ENV=production node dist/index.js`), requests to `http://localhost:9876/...` would get 301-redirected to `https://axtask.replit.app/...` without the localhost bypass. The smoke test would then fail because it can't reach the production domain from the test environment.

### Health Check Endpoint

Route: `GET /healthz` → responds `200 "ok"`
Registered in `server/index.ts` BEFORE `serveStatic(app)`. This is critical — if registered after, the SPA fallback in `serveStatic()` catches `/healthz` first and returns `index.html` instead of "ok".

### Static File Serving (SPA Fallback)

`server/vite.ts` → `serveStatic()`:
- Serves files from `dist/public/` using `express.static()`
- Wildcard fallback: any request that doesn't match a static file gets `index.html` (SPA routing)
- This means ANY route registered AFTER `serveStatic()` will be invisible — the wildcard catches it first

**Rule: All API routes and healthz MUST be registered BEFORE `serveStatic(app)` is called.**

### Google OAuth in Production

The OAuth redirect URI is auto-detected from request headers (`x-forwarded-host`, `x-forwarded-proto`) in `server/auth-providers.ts`. This means:
- Dev: auto-detects `https://<dev-domain>.spock.replit.dev/api/auth/google/callback`
- Production: auto-detects `https://axtask.replit.app/api/auth/google/callback`
- The `GOOGLE_REDIRECT_URI` env var is no longer used.

**Google Cloud Console requirement:** The production callback URI `https://axtask.replit.app/api/auth/google/callback` MUST be registered as an authorized redirect URI in Google Cloud Console → Credentials → OAuth 2.0 Client → Authorized redirect URIs. Without this, Google returns a 403 error.

### TypeScript Configuration

`tsconfig.json` key settings:
- `target: "ES2020"` and `downlevelIteration: true` — required for Map/Set iteration (`for...of` on Maps, spreading Sets)
- `strict: true` — full type checking enforced
- `skipLibCheck: true` — skips type-checking `.d.ts` files from node_modules
- `moduleResolution: "bundler"` — required for Vite/esbuild resolution
- Includes: `client/src/**/*`, `shared/**/*`, `server/**/*`

### Environment Variables

| Variable | Scope | Purpose |
|----------|-------|---------|
| `PORT` | development only | Server port (5000 in dev, Cloud Run sets in prod) |
| `REGISTRATION_MODE` | shared | "open" allows self-registration |
| `DATABASE_URL` | secret (runtime) | PostgreSQL connection string (Replit managed) |
| `SESSION_SECRET` | secret | Express session encryption key |
| `GOOGLE_CLIENT_ID` | secret | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | secret | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | secret (LEGACY) | No longer used — auto-detected from headers |

### Pre-Publish Validation

Run: `bash scripts/pre-publish-check.sh`

The script performs 6 checks in order. If any critical check fails, it exits with code 1 (blocking publish). Warnings are informational.

| Step | What it checks | Failure means |
|------|---------------|---------------|
| 1. TypeScript | `tsc --noEmit` zero errors | Type errors will likely cause runtime crashes |
| 2. Build | `npm run build` succeeds | Frontend or backend bundling is broken |
| 3. Artifacts | `dist/index.js` >1KB, `dist/public/` ≥2 files, `index.html` exists | Build produced incomplete output |
| 4. Smoke test | Starts server on port 9876, `/healthz` → 200 | Server crashes on startup or healthz is unreachable |
| 5. Auth | `/api/auth/config` has providers, `/api/auth/me` → 401, login rejects bad creds, Google login → 302 | Auth system is broken |
| 6. Static | `/` → 200, index.html has CSS+JS refs | Frontend isn't being served |

The smoke test starts the production server on port 9876 (not 5000, to avoid conflicting with the dev server). It retries up to 5 times with 1-second delays before declaring failure.

### Known Deployment Pitfalls (MUST READ)

1. **PORT env var conflict**: NEVER set PORT in shared env vars. Cloud Run sets its own PORT. A hardcoded `PORT=5000` in shared scope overrides Cloud Run and breaks deployment.

2. **Route registration order**: ALL API routes and `/healthz` MUST be registered BEFORE `serveStatic(app)`. The SPA wildcard fallback in serveStatic catches everything and returns index.html. Routes registered after it are invisible.

3. **HTTPS redirect breaks local smoke tests**: The production HTTPS redirect (`server/index.ts`) must skip localhost/127.0.0.1 or smoke tests fail with 301 redirects to unreachable production URLs.

4. **HTTPS detection uses x-forwarded-proto**: Cloud Run terminates TLS at the load balancer. The actual request to the app is HTTP. Check `req.get("x-forwarded-proto")` NOT `req.protocol` to determine if the original request was HTTPS.

5. **Google OAuth 403**: Production domain must be in Google Cloud Console authorized redirect URIs. The redirect URI is auto-detected from request headers — do not hardcode it.

6. **Helmet CSP blocks resources**: In production, Helmet enforces Content-Security-Policy. If you add new external resources (fonts, scripts, images, APIs), you must update the CSP directives in `server/index.ts`.

7. **esbuild uses external packages**: The backend bundle does NOT include node_modules. The production server needs `node_modules/` present. This is handled by Replit's deployment — it runs `npm install` during the build step.

8. **Incremental TypeScript cache**: `tsconfig.json` uses `incremental: true` with cache at `node_modules/typescript/tsbuildinfo`. If you get stale type errors after making changes, delete this file: `rm -f node_modules/typescript/tsbuildinfo`.

### CSRF Protection

All POST/PATCH/DELETE requests require a CSRF token. The frontend gets it from `getCsrfToken()` in `client/src/lib/queryClient.ts` and sends it as `x-csrf-token` header. Smoke tests that POST without CSRF will get 403 — this is expected behavior.

### Checklist for Agents Before Publishing

1. Run `npx tsc --noEmit --pretty` — must show zero errors
2. Run `npm run build` — must complete successfully
3. Verify `dist/index.js`, `dist/public/index.html`, and `dist/public/assets/` exist
4. Run `bash scripts/pre-publish-check.sh` — must pass all 6 checks
5. Confirm PORT is NOT set in shared env vars (only in development)
6. If Google OAuth is needed in production, confirm `https://axtask.replit.app/api/auth/google/callback` is in Google Cloud Console authorized redirect URIs
