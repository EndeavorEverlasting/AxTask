
# Priority Engine Task Management System

**Version:** 1.2.0 (Robustness + Security Hardening)  
**Status:** Production Ready  
**Last Updated:** April 3rd, 2026

## Overview

A full-stack task management application with an intelligent priority scoring engine that automatically calculates task priorities based on content analysis. Includes hardened import deduplication, usage/storage observability, attachment upload controls, and security event monitoring.

## Run locally after cloning with Docker

This is the fastest way to get a full stack (app + PostgreSQL) on your machine after you clone the repo.

### Shells: Windows Command Prompt vs Git Bash / macOS / Linux

Documentation often shows the Unix `cp` command. **Windows Command Prompt (`cmd.exe`) does not include `cp`** — you will see `'cp' is not recognized as an internal or external command`. Use any of these instead:

- **`npm run docker:env-init`** — creates `.env.docker` from the example (same on every OS).
- **Windows CMD:** `copy .env.docker.example .env.docker`
- **Windows PowerShell:** `Copy-Item .env.docker.example .env.docker`
- **Git Bash, WSL, macOS, Linux:** `cp .env.docker.example .env.docker`

The same idea applies to **`.env`** for non-Docker Quick Start: use **`npm run local:env-init`** or `copy` / `Copy-Item` / `cp` as appropriate.

1. **Install Docker** on the machine that will run AxTask:
   - **Windows / macOS:** [Docker Desktop](https://www.docker.com/products/docker-desktop/)
   - **Linux / server:** Docker Engine + Docker Compose v2 plugin  
   Step-by-step: [`docs/DOCKER_FOUNDATION.md`](docs/DOCKER_FOUNDATION.md)

2. **Clone** the repository and open a terminal in the **project root** (the folder that contains `package.json`).

3. **Create and edit `.env.docker`**

   From the project root, pick one (all create the file only if it is missing):

   - **Any OS (recommended):** `npm run docker:env-init`
   - **macOS / Linux:** `cp .env.docker.example .env.docker`
   - **Windows Command Prompt:** `copy .env.docker.example .env.docker`
   - **Windows PowerShell:** `Copy-Item .env.docker.example .env.docker`

   You can also run `npm run docker:up` once without a `.env.docker` file: it copies from `.env.docker.example` automatically, then stops with a clear error until you replace the placeholders and run it again.

   Open `.env.docker` and replace every placeholder:
   - **`POSTGRES_PASSWORD`** — strong password for the local database user
   - **`SESSION_SECRET`** — long random secret (32+ characters)
   - **`DATABASE_URL`** — keep host `database` and user/db names as in the example; **set the password in the URL to match `POSTGRES_PASSWORD`**

4. **Start the stack**

   - **Any OS (from project root):** `npm run docker:up`
   - **Windows:** double-click **`start-docker.cmd`** (runs `npm run docker:up` when Node.js / npm are installed)

   `npm run docker:up` creates `.env.docker` from `.env.docker.example` if the file is missing, refuses to start if secrets are still placeholders, waits for the Docker engine, and on **Windows** / **macOS** tries to start **Docker Desktop** when it is installed but not running. If Docker is already up and you only want Compose without that logic, use `npm run docker:start`.

5. **Open the app:** [http://localhost:5000](http://localhost:5000)  
   Check containers: `npm run docker:status` · Stop: `npm run docker:stop` · Logs: `npm run docker:logs`

### One-click Docker scripts

- **Windows:** `start-docker.cmd` · **macOS/Linux:** `bash ./start-docker.sh` (both use `npm run docker:up`)
- **Stop / status:** `stop-docker.cmd` or `bash ./stop-docker.sh` · `status-docker.cmd` or `bash ./status-docker.sh`

## Quick Start (Node.js + local PostgreSQL)

Use this when you prefer to run the app with `tsx` against your own Postgres (not the Docker Compose stack).

From the **project root**:

1. **`npm install`**
2. **Create `.env`** (only if you do not already have one):
   - **Any OS (recommended):** `npm run local:env-init` — copies `.env.example` when needed and **writes a strong `SESSION_SECRET` into `.env` without printing it**. If `.env` already exists, it only fixes `SESSION_SECRET` when it is missing or still a placeholder.
   - **macOS / Linux / Git Bash / WSL:** `cp .env.example .env` (then run **`npm run local:secrets-bootstrap`** so session signing works)
   - **Windows Command Prompt:** `copy .env.example .env` (then **`npm run local:secrets-bootstrap`**)
   - **Windows PowerShell:** `Copy-Item .env.example .env` (then **`npm run local:secrets-bootstrap`**)  
   Or run **`npm run offline:start`** once — it creates `.env` from `.env.example` automatically if missing, bootstraps `SESSION_SECRET`, installs deps, runs `db:push`, and starts the app.
3. Edit **`.env`**: set **`DATABASE_URL`** to a reachable PostgreSQL instance (for example `postgresql://postgres:postgres@localhost:5432/axtask`).
4. **`npm run db:push`** then **`npm run dev`**

Visit `http://localhost:5000` to access the application.

### One-click local/offline startup

- Windows: double-click `start-offline.cmd`
- Any OS with Node/npm: run `npm run offline:start` (same as `npm run dev:smart`)
- Optional (Windows): run `npm run offline:shortcut` once to create a Desktop shortcut named `Start AxTask Offline`
- In-app: use `Install App Shortcut` in the left sidebar to install on desktop/mobile home screen (or show setup steps if browser prompt is unavailable)
- First-login CTA: users also see a top install banner with `Dismiss` and `Don't show again` controls

This flow automatically installs dependencies (first run), creates `.env` from `.env.example` if missing, ensures **`SESSION_SECRET`** in `.env` (not printed), runs `db:push`, and starts the app.

## Local + Offline Workflow

You can run AxTask fully local (including when offline) as long as your PostgreSQL database is also local.

1. Create your local env file (and session secret):
   - **Any OS (recommended):** `npm run local:env-init` (also run it again if `SESSION_SECRET` was left as the example placeholder)
   - macOS / Linux / Git Bash / WSL: `cp .env.example .env`
   - Windows Command Prompt: `copy .env.example .env`
   - Windows PowerShell: `Copy-Item .env.example .env`
2. Ensure `.env` has a local `DATABASE_URL` (for example `postgresql://postgres:postgres@localhost:5432/axtask`).
3. Run from the AxTask project directory:
   - `npm install`
   - `npm run db:push`
   - `npm run dev`
4. Work offline as needed, then commit and push changes later when back online.

### Cached reads and offline UI (Phase A)

The SPA **persists TanStack Query read caches** to `localStorage` (except auth, admin, and billing API keys) so the last successful data can appear when the network drops. An **offline / stale banner** explains when you are viewing cached data. Logout clears the persisted cache. Details, security notes, and the **task conflict policy** for future sync work: [`docs/OFFLINE_PHASE_A.md`](docs/OFFLINE_PHASE_A.md).

**Phase B (device refresh):** httpOnly device cookie + `POST /api/auth/refresh` can restore a Passport session when the session cookie expired but the device token is still valid. See [`docs/OFFLINE_PHASE_B.md`](docs/OFFLINE_PHASE_B.md) and run `npm run db:push` after pulling.

**Local accounts:** Seeded dev users (`*@axtask.local`) and passwords appear in the **dev server terminal** only. To use a **real email** on the same local database, register through the UI; task merge from seed users is not automatic — see [`docs/LOCAL_ACCOUNT_TRANSITION.md`](docs/LOCAL_ACCOUNT_TRANSITION.md).

### Why local runs fail most often

- **`'cp' is not recognized`** (Windows **cmd**)  
  Use **`npm run local:env-init`** or **`npm run docker:env-init`**, or the **`copy`** / **`Copy-Item`** commands shown above — not Unix `cp`.
- `npm error Missing script: "db:push"`  
  You ran the command outside the AxTask folder. Run it from `AxTask`.
- `DATABASE_URL, ensure the database is provisioned`  
  `DATABASE_URL` is missing or invalid. Create `.env` from `.env.example` and update the DB URL.

## Key Features

- **🎯 Intelligent Priority Engine**: Automatic priority scoring based on keywords, tags, and content analysis
- **📊 Google Sheets Integration**: Real-time API sync with comprehensive setup guide
- **📈 Usage & Storage Stats**: Admin usage snapshots and storage policy visibility
- **📁 Import/Export + Dedupe**: CSV/Excel imports with duplicate fingerprint prevention
- **🖼️ Feedback Attachments**: Signed upload flow, scan checks, and retention controls
- **🔐 Security Intelligence**: Tamper-evident security event ledger and anomaly alerts
- **💎 Premium Retention Layer**: Pro plans, feature flags, smart views, review workflows, digests, and grace-mode lifecycle flows
- **🐳 Docker Foundation**: Dockerfile, compose stack, and deployment baseline docs
- **📱 Mobile Responsive**: Full mobile device compatibility

## Technology Stack

- **Frontend**: React 18 + TypeScript + TailwindCSS + shadcn/ui
- **Backend**: Node.js + Express + TypeScript + Drizzle ORM
- **Database**: PostgreSQL (Neon serverless)
- **State Management**: TanStack Query
- **Build Tools**: Vite + esbuild

## Architecture

```
React Client ↔ Express API ↔ PostgreSQL Database
     ↓              ↓              ↓
- Task Forms    - Priority      - Task Storage
- Analytics     - Engine        - Session Data
- Import/Export - Validation    - Indexes
```

## Priority Engine

The core algorithm calculates priorities using:

- **Base Score**: Urgency × Impact ÷ Effort
- **Keyword Bonuses**: Context-aware term detection (+0.5 to +3.0 points)
- **Tag Detection**: @urgent, #blocker, !important patterns
- **Time Sensitivity**: Deadline proximity analysis
- **Problem Indicators**: Bug/error/issue detection
- **Similarity Check**: Jaccard algorithm to prevent duplicates

**Priority Levels**: Highest (8+) → High (6-7) → Medium-High (4-5) → Medium (2-3) → Low (<2)

## Google Sheets Setup

Complete setup guide available in [`docs/GOOGLE_SHEETS_SETUP.md`](docs/GOOGLE_SHEETS_SETUP.md)

Required environment variables:
```env
GOOGLE_SHEETS_API_KEY=AIza...
GOOGLE_CLIENT_ID=123456789-abc...
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

## Development

### Scripts
- `npm run dev` - Start development server
- `npm run dev:smart` - Smart local startup: sync deps only if lockfile changed, run `db:push` only if schema changed, then start dev server
- `npm run deps:sync` - Sync dependencies from lockfile (`npm ci` fallback to `npm install`)
- `npm run docker:up` - Smart Docker startup: `.env.docker` bootstrap, placeholder checks, wait for engine (optionally start Docker Desktop on Windows/macOS), then compose up
- `npm run docker:start` - Direct `docker compose up -d --build` (engine must already be running)
- `npm run docker:stop` - Stop Docker stack (preserves named-volume data)
- `npm run docker:status` - Show container status
- `npm run docker:logs` - Show recent Docker logs
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run db:push` - Sync database schema
- `npm run test` - Run the full compendium of unit/integration/sweep tests (includes local login and Docker workflow guardrails)
- `npm run check` - Run TypeScript checks

### Auto-sync dependencies after pull

Think of this like buckling a seatbelt for the app.

1. Click one file one time:
   - Windows: double-click [`setup-hooks.cmd`](setup-hooks.cmd)
   - macOS/Linux: run [`setup-hooks.sh`](setup-hooks.sh)
2. That setup automatically does:
   - `git config core.hooksPath .githooks`
   - dependency sync
   - local trusted Node fingerprint registration for this machine

After that, when someone runs `git pull`, AxTask auto-checks for dependency changes and installs them.

If something ever gets out of sync, run:

```bash
npm run deps:sync
```

For matching behavior in `NodeWeaver`, run that repo's setup script once too.

### File Structure
```
├── client/          # React frontend
├── server/          # Express backend  
├── shared/          # Shared types/schemas
├── docs/            # Documentation
└── dist/            # Built application
```

## Documentation

- **[Docker foundation](docs/DOCKER_FOUNDATION.md)** - Install Docker, env file, compose stack (companion to **Run locally after cloning** above)
- **[Architecture Guide](docs/ARCHITECTURE.md)** - Technical architecture details
- **[Google Sheets Setup](docs/GOOGLE_SHEETS_SETUP.md)** - API configuration guide
- **[Security Guidelines](docs/SECURITY.md)** - Security best practices
- **[Sign-up verification (planned)](docs/MFA_SIGNUP_VERIFICATION.md)** - OTP/MFA at **new** account creation to reduce abuse; existing users keep normal login (step-up MFA only for sensitive actions)
- **[Version History](VERSION.md)** - Release notes and changelog
- **[Production migration branch report](docs/PRODUCTION_MIGRATION_BRANCH_REPORT.md)** - Compare `main` / `experimental/next` vs Replit publish lines and `baseline/published` before DB cutover
- **[Unified migration log](docs/MIGRATION_UNIFIED_LOG.md)** - Replit SHAs `008a8b0` / `afe5210`, deploy **D**, and integration tip **U**
- **[Staging and cutover runbook](docs/STAGING_CUTOVER_RUNBOOK.md)** - Restore staging DB, `db:push`, attachments, production cutover
- **[Migration automation](docs/MIGRATION_AUTOMATION.md)** - `migration:verify-schema`, smoke API, pg backup/restore scripts
- **[Deployment Migration Plan](docs/DEPLOYMENT_MIGRATION_PLAN.md)** - 48-hour cutover and rollback guardrails
- **[Next Setup Blueprint](docs/NEXT_SETUP_BLUEPRINT.md)** - Host/DB/domain and integration groundwork
- **[Cutover Runbook](docs/CUTOVER_RUNBOOK.md)** - Zero-downtime DNS cutover with Replit fallback
- **[Morning New-Box Migration Guide](docs/MORNING_NEW_BOX_MIGRATION_GUIDE.md)** - Fresh-machine checklist with vendor/domain decisions
- **[Morning Migration Checklist](docs/MORNING_NEW_BOX_MIGRATION_CHECKLIST.md)** - Execution-only checklist for fast cutover
- **[Branding and Fallback Modularity](docs/BRANDING.md)** - Logo paths and host-pivot guardrails
- **[Per-Time Activity Association Test Plan](docs/PER_TIME_ACTIVITY_ASSOCIATION_TEST_PLAN.md)** - Active-user gating metrics and premium-affinity validation fixtures
- **[Docker-First Accessibility Path](docs/DOCKER_ACCESSIBILITY_PATH.md)** - Step-by-step path to make startup and updates easy for non-technical users

## Features in Detail

### Task Management
- Create/edit/delete tasks with rich forms
- Automatic priority calculation and classification
- Status tracking (pending, in-progress, completed)
- Search and advanced filtering options

### Analytics
- Task distribution charts
- Priority trend analysis
- Classification breakdowns
- Performance metrics

### Import/Export
- CSV and Excel file support (.csv, .xlsx, .xls)
- Google Sheets format compatibility
- Batch processing with progress tracking
- Duplicate prevention using deterministic task fingerprints

### Usage, Storage, and Attachments
- `usage_snapshots` table for request/error/p95/storage/task trends
- `storage_policies` and `attachment_assets` for quota and retention enforcement
- Signed upload tokens for attachments and image-scan gate before persistence
- Admin endpoints for usage capture, storage visibility, and retention dry-run/execute

### Security Intelligence
- Chained `security_events` ledger (`prevHash` + `eventHash`) for tamper-evident auditing
- Security alert rules for failed-login bursts and route-failure anomalies
- Admin UI tab for event stream and alert review

### Feedback + Classifier Engines
- Feedback submissions are processed through a feedback engine (priority, sentiment, tags, actions)
- Universal classifier API supports modular fallback layers:
  - External classifier (`UNIVERSAL_CLASSIFIER_API_URL` + optional API key)
  - Priority engine local classifier fallback
  - Keyword fallback layer
- API endpoints:
  - `POST /api/feedback/process`
  - `POST /api/classification/classify`

### Admin Feedback Inbox
- Filter by priority, review state, reviewer, and tags
- Sort by newest, oldest, or critical-first
- Bulk mark filtered rows reviewed/unreviewed
- Export currently filtered rows as CSV
- Save/load feedback filter presets for repeat triage views

### Premium Features (30-day retention rollout)
- Hybrid catalog (`AxTask Pro`, `NodeWeaver Pro`, `Power Bundle`) via `GET /api/premium/catalog`
- Entitlements + subscriptions via `GET /api/premium/entitlements` and activation/lifecycle routes
- Smart saved views with default landing and auto-refresh controls:
  - `GET/POST /api/premium/saved-views`
  - `PUT/DELETE /api/premium/saved-views/:id`
  - `POST /api/premium/saved-views/:id/default`
- Recurring review workflows:
  - `GET/POST /api/premium/review-workflows`
  - `PUT/DELETE /api/premium/review-workflows/:id`
  - `POST /api/premium/review-workflows/:id/run`
- Cross-product bundle automation:
  - `POST /api/premium/bundle/reclassify-backlog`
  - `POST /api/premium/bundle/auto-reprioritize`
- Weekly digest and insight loops:
  - `POST /api/premium/digests/weekly`
  - `GET/POST /api/premium/insights`
  - `POST /api/premium/insights/:id/resolve`
- Grace-mode anti-churn flow:
  - `POST /api/premium/subscriptions/downgrade`
  - `POST /api/premium/subscriptions/reactivate`
  - `GET /api/premium/reactivation-prompts`

### Notification Mode (Push + Intensity)
- Toggleable notification mode in the sidebar with a `0-100` intensity slider.
- Browser push permission is requested when enabling notifications.
- Preferences persist per account via server-backed APIs:
  - `GET /api/notifications/preferences`
  - `PATCH /api/notifications/preferences`
  - `GET /api/notifications/subscriptions`
  - `POST /api/notifications/subscriptions`
  - `DELETE /api/notifications/subscriptions`
- Intensity mapping for dispatch cadence:
  - `0`: Off
  - `1-30`: Low
  - `31-70`: Balanced
  - `71-100`: Frequent

Required env for browser push subscription:
```env
VITE_VAPID_PUBLIC_KEY=...
```

After pulling these changes, run:
```bash
npm run db:push
```
- Admin retention metrics:
  - `GET /api/admin/premium/retention?days=30`

## Security

- Input validation with Zod schemas
- SQL injection protection via parameterized queries
- Environment-based configuration
- Session management with PostgreSQL storage
- Node runtime policy: only approved LTS baselines are allowed (20.16+ or 22.x) via `npm run security:node-runtime-guard`
- Node provenance policy: Node binary fingerprint must be trusted first via:
  - `npm run security:node-provenance:approve-local` (one-time per machine)
  - validated by `npm run security:node-provenance-guard`
- Dependency safety policy: do not add or invoke `axios`; use platform-native `fetch` for HTTP calls
- Local enforcement (automatic after setup script):
  - `npm run security:node-runtime-guard`
  - `npm run security:node-provenance-guard`
  - `npm run security:axios-guard`

## Deployment

Supports Replit and self-managed deployments with:
- Single port configuration (5000)
- Static file serving via Express
- Environment variable management
- Environment variable/secrets management
- PostgreSQL database integration
- Usage/billing monitoring and alerting recommended for production cutover

Docker assets included:
- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `.env.docker.example`
- `docs/DOCKER_FOUNDATION.md`

Important:
- Dockerizing on your machine does not automatically Dockerize other machines.
- Every workstation/server that will run AxTask must have Docker runtime installed and configured.
- If deploying to a server, install Docker Engine + Compose plugin there, copy project/env, then run `npm run docker:up` or `npm run docker:start` (or `docker compose up -d --build`).

For a migration path away from Replit with cost-control guardrails, see [`docs/DEPLOYMENT_MIGRATION_PLAN.md`](docs/DEPLOYMENT_MIGRATION_PLAN.md).
For a step-by-step zero-downtime procedure, use [`docs/CUTOVER_RUNBOOK.md`](docs/CUTOVER_RUNBOOK.md).

## Pending / Not Yet Implemented

The following roadmap items are intentionally still open:

- Immersive reminder mode with native OS notifications and user-controlled intensity:
  - Toggle on/off (`Reminders Enabled`) and optional first-run consent prompt
  - Delivery adapters by platform:
    - Windows: Notification Center toast + optional Task Scheduler fallback
    - macOS: Notification Center + optional Calendar/Reminder bridge
    - Linux: Desktop notifications (`notify-send`/DBus) + optional cron/systemd timers
    - Mobile/PWA: browser push/local notifications where supported
  - Frequency continuum (`Quiet`, `Balanced`, `Focused`, `Coach`) controlling reminder cadence and escalation
  - Per-task reminder controls (single nudge, recurring, deadline-proximity boosts)
  - User safeguards: snooze, mute window, do-not-disturb sync, and easy global disable
  - Engine/agent reminder generation based on task priority, due dates, and inactivity signals
- Full cloud object storage integration (S3/R2 direct signed upload) instead of filesystem-backed object storage
- Production malware/AV scanning integration (current scan is signature/content guard, not external AV)
- Billing provider integration for live invoice payments/webhooks (foundation routes exist)
- Wider in-app analytics/event visualization beyond admin security and usage/storage surfaces
- Additional high-signal anomaly rules and automated alert delivery channels (email/Slack/Pager)

## License

MIT License - see LICENSE file for details

---

**Need help?** Check the [documentation](docs/) or review the [architecture guide](docs/ARCHITECTURE.md) for technical details.
