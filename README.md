
# AxTask

**Priority engine task management** — intelligent scoring, calendar workflows, offline-ready client, and hardened security foundations.

**Version:** 1.2.0 (Robustness + Security Hardening)  
**Status:** Production Ready  
**Last Updated:** April 5th, 2026

## Overview

A full-stack task management application with an intelligent priority scoring engine that automatically calculates task priorities based on content analysis. Includes hardened import deduplication, usage/storage observability, attachment upload controls, and security event monitoring.

**Product roadmap and vision checklist:** [docs/PRODUCT_ROADMAP.md](docs/PRODUCT_ROADMAP.md) (start here after cloning). Billing UI and account-plane APIs: [docs/BILLING_UI.md](docs/BILLING_UI.md). Engine orchestration: [docs/ENGINES.md](docs/ENGINES.md).

## Run locally after cloning with Docker

This is the fastest way to get a full stack (app + PostgreSQL) on your machine after you clone the repo.

### Shells: Windows Command Prompt vs Git Bash / macOS / Linux

Documentation often shows the Unix `cp` command. **Windows Command Prompt (`cmd.exe`) does not include `cp`** — you will see `'cp' is not recognized as an internal or external command`. Use any of these instead:

- **`npm run docker:env-init`** — creates `.env.docker` from the example (same on every OS).
- **`npm run submodule:init`** — runs `git submodule update --init --recursive` when you cloned without `--recurse-submodules` (NodeWeaver lives in a submodule).
- **Windows CMD:** `copy .env.docker.example .env.docker`
- **Windows PowerShell:** `Copy-Item .env.docker.example .env.docker`
- **Git Bash, WSL, macOS, Linux:** `cp .env.docker.example .env.docker`

The same idea applies to **`.env`** for non-Docker Quick Start: use **`npm run local:env-init`** or `copy` / `Copy-Item` / `cp` as appropriate.

1. **Install Docker** on the machine that will run AxTask:
   - **Windows / macOS:** [Docker Desktop](https://www.docker.com/products/docker-desktop/)
   - **Linux / server:** Docker Engine + Docker Compose v2 plugin  
   Step-by-step: [`docs/DOCKER_FOUNDATION.md`](docs/DOCKER_FOUNDATION.md)

2. **Clone the repo and work from the project root**

   **Project root** is the folder that contains **`package.json`** and **`docker-compose.yml`**. Run every `npm run …` command in this guide from that directory (your shell prompt should show that folder name after `cd`).

   **Clone with submodules** (recommended — pulls **NodeWeaver** for optional `docker:up:nodeweaver`):

   ```bash
   git clone --recurse-submodules https://github.com/EndeavorEverlasting/AxTask.git
   cd AxTask
   ```

   Use your **fork’s URL** or **SSH** (`git clone --recurse-submodules git@github.com:YOUR_USER/AxTask.git`) if that is how you work.

   **Already cloned without `--recurse-submodules`?** From inside the repo:

   ```bash
   npm run submodule:init
   ```

   That runs `git submodule update --init --recursive`. Then stay in the same directory for the steps below.

   **Check you are in the right place:** `dir package.json` (Windows CMD), `Test-Path package.json` (PowerShell), or `ls package.json` (macOS/Linux) should succeed.

   **PowerShell quick check (copy/paste):**

   ```powershell
   cd C:\Users\Cheex\Desktop\dev\AxTask
   Test-Path .\package.json
   npm run docker:env-init
   ```

   `Test-Path .\package.json` should print `True`. If you see `npm error Missing script: "docker:env-init"`, you are not in the `AxTask` folder yet.

3. **Create and edit `.env.docker`**

   **Guided GUI path (recommended for non-technical setup):**
   - Run `npm run docker:setup`
   - A local browser wizard opens, writes `.env.docker`, and can run `docker:up` directly

   From the project root, pick one (all create the file only if it is missing):

   - **Any OS (recommended):** `npm run docker:env-init`
   - **macOS / Linux:** `cp .env.docker.example .env.docker`
   - **Windows Command Prompt:** `copy .env.docker.example .env.docker`
   - **Windows PowerShell:** `Copy-Item .env.docker.example .env.docker`

   You can also run `npm run docker:up` once without a `.env.docker` file: it copies from `.env.docker.example` automatically, then stops with a clear error until you replace the placeholders and run it again.

   **Novice/zero-edit local path:** you can keep `.env.docker.example` defaults for local-only testing and run `npm run docker:up` immediately.

   If you customize `.env.docker`, ensure:
   - **`POSTGRES_PASSWORD`** and the password inside **`DATABASE_URL`** match exactly
   - **`SESSION_SECRET`** is a long random secret (32+ characters) for non-demo use
   - Optional — **`VITE_QUERY_PERSIST_BUSTER`** in `.env.docker`: bump and **rebuild** the image after a breaking API change so browsers reset persisted read caches (Phase A). See [Docker foundation — Offline Phase A](docs/DOCKER_FOUNDATION.md#offline-phase-a-read-cache-and-rebuilds).
   - **Phase B (device refresh)** needs the **`device_refresh_tokens`** table; the stack’s **migrate** step applies it automatically. See [Docker foundation — Offline Phase B](docs/DOCKER_FOUNDATION.md#offline-phase-b-device-refresh-database) and [`docs/OFFLINE_PHASE_B.md`](docs/OFFLINE_PHASE_B.md).
   - **Docker demo login** — when **`AXTASK_DOCKER_SEED_DEMO=1`** (default in `.env.docker.example`), the **migrate** step creates/updates **`DOCKER_DEMO_USER_EMAIL`** / **`DOCKER_DEMO_PASSWORD`**. After **`npm run docker:up`**, the same credentials are **printed again in your terminal** for convenience. Turn **`AXTASK_DOCKER_SEED_DEMO=0`** and use strong secrets before any internet-exposed deployment.

4. **Start the stack**

   - **Any OS (from project root):** `npm run docker:up`
   - **Windows:** double-click **`start-docker.cmd`** (runs `npm run docker:up` when Node.js / npm are installed)

   `npm run docker:up` creates `.env.docker` from `.env.docker.example` if the file is missing, refuses to start if secrets are still placeholders, waits for the Docker engine, and on **Windows** / **macOS** tries to start **Docker Desktop** when it is installed but not running. If Docker is already up and you only want Compose without that logic, use `npm run docker:start`.

5. **Open the app:** [http://localhost:5000](http://localhost:5000)  
   **Sign in:** use the **demo email/password** echoed by `docker:up` (from `.env.docker`) or click **Register** if demo seed is off.  
   Check containers: `npm run docker:status` · Stop: `npm run docker:stop` · Logs: `npm run docker:logs`

Cleanup modes (clear separation):
- **Safe cleanup (default, preserves DB/storage data):** `npm run docker:cleanup`
- **Destructive reset (deletes Docker volumes/data):** `npm run docker:reset`

If `migrate` fails with `password authentication failed for user "axtask"`:
- Confirm `.env.docker` has matching values for `POSTGRES_PASSWORD` and the password inside `DATABASE_URL`.
- If they already match, reset stale local DB state (this deletes local Docker Postgres data):  
  `docker compose --env-file .env.docker down -v`  
  then rerun `npm run docker:up`.

### Local demo defaults vs real account security

- **Local-only demo:** keeping `.env.docker.example` defaults is acceptable for offline/local machine testing.
- **Any shared or internet-exposed environment:** replace defaults, use strong secrets, and disable demo seeding.
- **Authentication boundary:** sync/integration actions should require authenticated account sessions.
- **MFA boundary (recommended):** require step-up MFA for high-risk actions (billing, external account linking, and sync authorization). See [docs/MFA_SIGNUP_VERIFICATION.md](docs/MFA_SIGNUP_VERIFICATION.md).

### Optional: NodeWeaver in the same Compose stack

Classification can call a **NodeWeaver** HTTP service (`NODEWEAVER_URL`). To run it **next to AxTask** in Docker: ensure the submodule is present (**`npm run submodule:init`** if you did not use `git clone --recurse-submodules`), set `NODEWEAVER_URL=http://nodeweaver:5000` in `.env.docker`, then start with **`npm run docker:up:nodeweaver`** (or `node tools/local/docker-start.mjs --with-nodeweaver`). The default `npm run docker:up` does **not** start NodeWeaver. Full steps: [`services/nodeweaver/README.md`](services/nodeweaver/README.md).

### One-click Docker scripts

- **Windows:** `start-docker.cmd` · **macOS/Linux:** `bash ./start-docker.sh` (both use `npm run docker:up`)
- **Guided setup GUI:** `npm run docker:setup` (local wizard for `.env.docker` + optional one-click start)
- **Stop / status:** `stop-docker.cmd` or `bash ./stop-docker.sh` · `status-docker.cmd` or `bash ./status-docker.sh`

## Quick Start (Node.js + local PostgreSQL)

Use this when you prefer to run the app with `tsx` against your own Postgres (not the Docker Compose stack).

**Clone and `cd`:** same as [Run locally after cloning with Docker](#run-locally-after-cloning-with-docker) — step **2** (`git clone --recurse-submodules …`, `cd AxTask`, and **`npm run submodule:init`** if you cloned without submodules).

From the **project root**:

**Recommended (one flow):** **`npm run local:start`** (alias: **`npm run offline:start`** / **`npm run dev:smart`**) does, in order: **`npm run local:env-init`** (creates `.env` from `.env.example` when needed and bootstraps **`SESSION_SECRET`** without printing it), dependency install/sync, **`npm run db`** (schema push) when the schema fingerprint changes, then **`npm run dev`** with **`NODE_ENV=development`** already set — dev users **`dev@axtask.local`** / **`admin@axtask.local`** and their **one-time passwords** are printed in **that server terminal** on each start.

Before the first successful run, edit **`.env`** after `local:env-init` and set **`DATABASE_URL`** to a reachable PostgreSQL URL (for example `postgresql://postgres:postgres@localhost:5432/axtask`).

**Manual equivalent:** `npm run local:env-init`, then `npm install`, then `npm run db`, then `npm run dev`. The script `npm run db` is a shortcut for `npm run db:push`.

If you prefer not to run `local:env-init`, create `.env` manually: **Windows CMD:** `copy .env.example .env` · **PowerShell:** `Copy-Item .env.example .env` · **macOS/Linux/Git Bash:** `cp .env.example .env` — then run **`npm run local:secrets-bootstrap`** so session signing works.

Visit `http://localhost:5000` to access the application.

### One-click local/offline startup

- Windows: double-click `start-offline.cmd`
- Any OS with Node/npm: run **`npm run local:start`** (same as **`npm run offline:start`** / **`npm run dev:smart`**)
- Optional (Windows): run `npm run offline:shortcut` once to create a Desktop shortcut named `Start AxTask Offline`
- In-app: use `Install App Shortcut` in the left sidebar to install on desktop/mobile home screen (or show setup steps if browser prompt is unavailable)
- First-login CTA: users also see a top install banner with `Dismiss` and `Don't show again` controls

This flow automatically runs **`local:env-init`**, installs dependencies when needed, runs **`db:push`** when the schema changes, and starts the dev server with **`NODE_ENV=development`**.

## Local + Offline Workflow

You can run AxTask fully local (including when offline) as long as your PostgreSQL database is also local.

1. Ensure **`.env`** has a local **`DATABASE_URL`** (use **`npm run local:env-init`** first if you do not have `.env` yet).
2. From the project directory: **`npm run local:start`** (or the manual chain: **`npm install`**, **`npm run db`**, **`npm run dev`**).
3. Work offline as needed, then commit and push changes later when back online.

### Cached reads and offline UI (Phase A)

The SPA **persists TanStack Query read caches** to `localStorage` (except auth, admin, and billing API keys) so the last successful data can appear when the network drops. An **offline / stale banner** explains when you are viewing cached data. Logout clears the persisted cache. Details, security notes, and the **task conflict policy** for future sync work: [`docs/OFFLINE_PHASE_A.md`](docs/OFFLINE_PHASE_A.md).

**Phase B (device refresh):** httpOnly device cookie + `POST /api/auth/refresh` can restore a Passport session when the session cookie expired but the device token is still valid. See [`docs/OFFLINE_PHASE_B.md`](docs/OFFLINE_PHASE_B.md) and run `npm run db:push` after pulling (Docker Compose runs this via the **migrate** service — [`docs/DOCKER_FOUNDATION.md`](docs/DOCKER_FOUNDATION.md#offline-phase-b-device-refresh-database)).

**Phase C (offline task writes):** queued mutations in the browser, optimistic concurrency on `PUT`/`DELETE` tasks, and a conflict dialog. See [`docs/OFFLINE_PHASE_C.md`](docs/OFFLINE_PHASE_C.md).

**Local accounts:** Seeded dev users (`*@axtask.local`) and passwords appear in the **dev server terminal** only. To use a **real email** on the same local database, register through the UI; task merge from seed users is not automatic — see [`docs/LOCAL_ACCOUNT_TRANSITION.md`](docs/LOCAL_ACCOUNT_TRANSITION.md).

### Why local runs fail most often

- **`'cp' is not recognized`** (Windows **cmd**)  
  Use **`npm run local:env-init`** or **`npm run docker:env-init`**, or the **`copy`** / **`Copy-Item`** commands shown above — not Unix `cp`.
- **`npm error Missing script: "docker:env-init"`**  
  You ran the command outside the AxTask project root. `cd AxTask` first, then re-run `npm run docker:env-init`.
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
- `npm run docker:cleanup` - Safe cleanup: remove containers/networks/orphans + dangling images (preserves named-volume data)
- `npm run docker:reset` - Destructive cleanup: `docker:cleanup` + volume wipe (deletes local Docker DB/storage data)
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
- **[Security policy](docs/SECURITY.md)** — vulnerability reporting and expectations (start here)
- **[Security technical reference](docs/SECURITY_TECHNICAL_REFERENCE.md)** — contributor-level architecture notes (**also public** if the repo is public; optional to remove for less exposure)
- **[Sign-up verification (planned)](docs/MFA_SIGNUP_VERIFICATION.md)** - OTP/MFA at **new** account creation to reduce abuse; existing users keep normal login (step-up MFA only for sensitive actions)
- **[Version History](VERSION.md)** - Release notes and changelog
- **[Production migration branch report](docs/PRODUCTION_MIGRATION_BRANCH_REPORT.md)** - Compare `main` / `experimental/next` vs Replit publish lines and `baseline/published` before DB cutover
- **[Unified migration log](docs/MIGRATION_UNIFIED_LOG.md)** - Replit SHAs `008a8b0` / `afe5210`, deploy **D**, and integration tip **U**
- **[Production DB migration strategy](docs/PRODUCTION_DB_MIGRATION_STRATEGY.md)** - Overview: branch **U**, automation, staging/cutover links, risks (no secrets)
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

- **OPSEC sprint (immersive checklist + CI test receipt):** [docs/OPSEC_IMMERSIVE_SPRINT.md](docs/OPSEC_IMMERSIVE_SPRINT.md) · auto-updated [docs/TEST_ATTESTATION.md](docs/TEST_ATTESTATION.md) when `main` tests pass in GitHub Actions
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

### Replit and GitHub safety

Replit Agent and hosted workflows can push commits or run hooks without your intent. The repo cannot fully block that; combine **GitHub settings**, **secrets isolation**, and the **`post-merge` script** below.

1. **Branch protection (GitHub)** — On the default branch (e.g. `main`): require pull requests, require approvals (or CODEOWNERS), block force-push, and avoid granting broad write tokens to Replit when a protected branch would reject the push anyway.
2. **Database isolation** — Do not point a Repl used for experiments at **production** `DATABASE_URL`. Prefer staging-only secrets on Replit; deploy production from a host you control (Render, Docker, etc.).
3. **Post-merge `db:push` is opt-in** — After a merge, Replit runs [`scripts/post-merge.sh`](scripts/post-merge.sh), which runs `npm install` and only runs **`npm run db:push`** when **`AXTASK_POST_MERGE_DB_PUSH=1`** is set (e.g. in Replit Secrets). Default is **skip**, so schema sync does not run automatically against whatever database the Repl has configured.
4. **Fork or non-production branch** — Connect Replit to a fork or a branch other than production’s deploy branch; merge to production via PR from your machine or CI.

See also [`AGENTS.md`](AGENTS.md) for assistant/automation guardrails and [`replit.md`](replit.md) for workspace notes.

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
