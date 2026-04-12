
# Priority Engine Task Management System

**Version:** 1.2.0 (Robustness + Security Hardening)  
**Status:** Production Ready  
**Last Updated:** April 3rd, 2026

## Overview

A full-stack task management application with an intelligent priority scoring engine that automatically calculates task priorities based on content analysis. Includes hardened import deduplication, usage/storage observability, attachment upload controls, and security event monitoring.

## Quick Start

```bash
npm install
cp .env.example .env
npm run db:push
npm run dev
```

Visit `http://localhost:5000` to access the application.

The Quick Start block above runs **`npm run db:push` then `npm run dev` only**; it does **not** run `scripts/apply-migrations.mjs`. For smart start, Docker vs local, exact command order, and flowcharts, see **[docs/DEV_DATABASE_AND_SCHEMA.md](docs/DEV_DATABASE_AND_SCHEMA.md)**.

## Docker Quick Start (Recommended for Workstations)

Prerequisite on each machine:
- Docker Desktop (Windows/macOS), or Docker Engine + Docker Compose plugin (Linux/server)

First run:

```bash
cp .env.docker.example .env.docker
# Set strong values for POSTGRES_PASSWORD and SESSION_SECRET
npm run docker:start
```

Then open `http://localhost:5000`.

### One-click Docker startup

- Windows: double-click `start-docker.cmd`
- macOS/Linux: run `bash ./start-docker.sh`
- Stop: `stop-docker.cmd` or `bash ./stop-docker.sh`
- Status: `status-docker.cmd` or `bash ./status-docker.sh`
- Logs: `npm run docker:logs`
- New machine walkthrough (Docker Desktop): see `docs/DOCKER_FOUNDATION.md` -> "Docker Desktop setup (Windows/macOS)"

### One-click local/offline startup

- Windows: double-click `start-offline.cmd`
- Any OS with Node/npm: run `npm run offline:start` (same as `npm run dev:smart`)
- Optional (Windows): run `npm run offline:shortcut` once to create a Desktop shortcut named `Start AxTask Offline`
- In-app: use `Install App Shortcut` in the left sidebar to install on desktop/mobile home screen (or show setup steps if browser prompt is unavailable)
- First-login CTA: users also see a top install banner with `Dismiss` and `Don't show again` controls

This flow runs [`tools/local/offline-start.mjs`](tools/local/offline-start.mjs): installs dependencies when needed, ensures `.env` via `local:env-init`, runs **`node scripts/apply-migrations.mjs` every time**, runs **`npm run db:push`** only when the schema fingerprint changed (`shared/schema.ts`, `drizzle.config.ts`, `migrations/*.sql`), then starts the dev server with `npx tsx server/index.ts`. Details: [docs/DEV_DATABASE_AND_SCHEMA.md](docs/DEV_DATABASE_AND_SCHEMA.md).

## Local + Offline Workflow

You can run AxTask fully local (including when offline) as long as your PostgreSQL database is also local.

1. Create your local env file:
   - macOS/Linux: `cp .env.example .env`
   - Windows PowerShell: `Copy-Item .env.example .env`
2. Ensure `.env` has a local `DATABASE_URL` (for example `postgresql://postgres:postgres@localhost:5432/axtask`).
3. Run from the AxTask project directory:
   - `npm install`
   - After schema or migration changes: `node scripts/apply-migrations.mjs` (if `migrations/*.sql` changed) and/or `npm run db:push`
   - `npm run dev` (server only; does not run migrations or push)
   - **Or** use `npm run dev:smart` once to follow the full ordered flow automatically: [docs/DEV_DATABASE_AND_SCHEMA.md](docs/DEV_DATABASE_AND_SCHEMA.md)
4. Work offline as needed, then commit and push changes later when back online.

### Why local runs fail most often

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
- `npm run dev` - Start development server only (no `apply-migrations`, no `db:push`)
- `npm run dev:smart` - Smart local startup: SQL migrations every run, `db:push` when fingerprint changes, deps sync when lockfile changes; see [docs/DEV_DATABASE_AND_SCHEMA.md](docs/DEV_DATABASE_AND_SCHEMA.md)
- `npm run deps:sync` - Sync dependencies from lockfile (`npm ci` fallback to `npm install`)
- `npm run docker:start` - Build/start Docker app + Postgres stack
- `npm run docker:stop` - Stop Docker stack (preserves named-volume data)
- `npm run docker:status` - Show container status
- `npm run docker:logs` - Show recent Docker logs
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run db:push` - Sync database schema
- `npm run test` - Run the full compendium of unit/integration/sweep tests (includes local login and Docker workflow guardrails)
- `npm run check` - Run TypeScript checks

### PR Size and Segmentation Policy

Code review quality drops on very large PRs. Keep pull requests below the hard CI cap and prefer smaller slices for CodeRabbit review.

- CI hard stop is enforced at 300 changed files by [`.github/workflows/pr-file-limit.yml`](.github/workflows/pr-file-limit.yml).
- Recommended review target is 200 files or less for better automated feedback quality.
- For large branches, split by concern (schema/migrations, server API, client UI, docs/tests).
- Use [`tools/local/split-pr-helper.mjs`](tools/local/split-pr-helper.mjs) to generate split manifests and branch commands:

```bash
node tools/local/split-pr-helper.mjs --base origin/main --max-files 200
```

- Or use use-case factoring CLI:

```bash
npm run pr:factor
```

### Monorepo Note

- AxTask should be operated as a monorepo-style repository for CI and release workflows.
- **NodeWeaver** (standalone universal classifier; also used by AxTask) is **vendored** at `services/nodeweaver/upstream`—not a git submodule. See [`docs/NODEWEAVER.md`](docs/NODEWEAVER.md).
- NodeWeaver runs in hybrid mode: internal vendored component by default, optional external service mode when deployment profile requires it.
- Classification ownership is shared: NodeWeaver engine core + AxTask fallback/orchestration policy.
- The old path `NodeWeaver._pre_submodule_backup` is no longer tracked in git (legacy submodule gitlink removed); ignore any local leftover folder.
- If NodeWeaver is required for local/CI integration, use the vendored `services/nodeweaver/upstream` path.

### Deployment-Impact Test Sweep Policy

If a change touches runtime behavior (API routes, storage/schema, auth, CI/CD, Docker, startup scripts), run a targeted sweep before merge:

- `npm run check` (TypeScript guardrail)
- targeted `npm test -- <path/to/test>` for each touched domain
- migration sanity checks when SQL or shared schema changes
- endpoint smoke checks for newly added or modified API routes

Add or update unit tests when any of these apply:

- new schema validation contracts
- new route/storage behaviors
- session/progression logic that mutates persisted state

Recent mini-games push should be segmented as:

1. schema + migration + schema tests
2. server routes/storage + server tests
3. client page/hooks/nav + UI tests
4. docs/process updates

Recommended validation per segment:

- Segment 1: `npm test -- shared/study-schema.test.ts`
- Segment 2: route/storage targeted tests (add new tests if absent for new handlers)
- Segment 3: UI/component tests for mini-game entry and session flow
- Segment 4: docs + CI workflow lint/sanity checks

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

For NodeWeaver-matched behavior, use the vendored path (`services/nodeweaver/upstream`) or the selected external service profile ([`docs/NODEWEAVER.md`](docs/NODEWEAVER.md)).

### File Structure
```
├── client/          # React frontend
├── server/          # Express backend  
├── shared/          # Shared types/schemas
├── docs/            # Documentation
└── dist/            # Built application
```

## Documentation

- **[Architecture Guide](docs/ARCHITECTURE.md)** - Technical architecture details
- **[NodeWeaver in this repo](docs/NODEWEAVER.md)** - Standalone classifier vs vendored monorepo path (`services/nodeweaver/upstream`)
- **[Active/Legacy Index](docs/ACTIVE_LEGACY_INDEX.md)** - Canonical active vs transitional vs legacy classification
- **[Debugging Reference](docs/DEBUGGING_REFERENCE.md)** - Deployment-impact test sweep checklist and common fixes
- **[Google Sheets Setup](docs/GOOGLE_SHEETS_SETUP.md)** - API configuration guide
- **[Security Guidelines](docs/SECURITY.md)** - Security best practices
- **[Version History](VERSION.md)** - Release notes and changelog
- **[Deployment Migration Plan](docs/DEPLOYMENT_MIGRATION_PLAN.md)** - Transitional runbook: 48-hour cutover and rollback guardrails
- **[Next Setup Blueprint](docs/NEXT_SETUP_BLUEPRINT.md)** - Transitional runbook: host/DB/domain and integration groundwork
- **[Cutover Runbook](docs/CUTOVER_RUNBOOK.md)** - Transitional runbook: zero-downtime DNS cutover with Replit fallback
- **[Morning New-Box Migration Guide](docs/MORNING_NEW_BOX_MIGRATION_GUIDE.md)** - Transitional runbook: fresh-machine checklist with vendor/domain decisions
- **[Morning Migration Checklist](docs/MORNING_NEW_BOX_MIGRATION_CHECKLIST.md)** - Transitional runbook: execution-only checklist for fast cutover
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
- If deploying to a server, install Docker Engine + Docker Compose plugin there, copy project/env, then run `npm run docker:start` (or `docker compose up -d --build`).

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
