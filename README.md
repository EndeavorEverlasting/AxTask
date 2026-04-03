
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

### One-click local/offline startup

- Windows: double-click `start-offline.cmd`
- Any OS with Node/npm: run `npm run offline:start`
- Optional (Windows): run `npm run offline:shortcut` once to create a Desktop shortcut named `Start AxTask Offline`
- In-app: use `Install App Shortcut` in the left sidebar to install on desktop/mobile home screen (or show setup steps if browser prompt is unavailable)
- First-login CTA: users also see a top install banner with `Dismiss` and `Don't show again` controls

This flow automatically installs dependencies (first run), creates `.env` from `.env.example` if missing, runs `db:push`, and starts the app.

## Local + Offline Workflow

You can run AxTask fully local (including when offline) as long as your PostgreSQL database is also local.

1. Create your local env file:
   - macOS/Linux: `cp .env.example .env`
   - Windows PowerShell: `Copy-Item .env.example .env`
2. Ensure `.env` has a local `DATABASE_URL` (for example `postgresql://postgres:postgres@localhost:5432/axtask`).
3. Run from the AxTask project directory:
   - `npm install`
   - `npm run db:push`
   - `npm run dev`
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
- `npm run dev` - Start development server
- `npm run deps:sync` - Sync dependencies from lockfile (`npm ci` fallback to `npm install`)
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run db:push` - Sync database schema
- `npm run test` - Run unit/integration tests
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

- **[Architecture Guide](docs/ARCHITECTURE.md)** - Technical architecture details
- **[Google Sheets Setup](docs/GOOGLE_SHEETS_SETUP.md)** - API configuration guide
- **[Security Guidelines](docs/SECURITY.md)** - Security best practices
- **[Version History](VERSION.md)** - Release notes and changelog
- **[Deployment Migration Plan](docs/DEPLOYMENT_MIGRATION_PLAN.md)** - 48-hour cutover and rollback guardrails
- **[Next Setup Blueprint](docs/NEXT_SETUP_BLUEPRINT.md)** - Host/DB/domain and integration groundwork
- **[Cutover Runbook](docs/CUTOVER_RUNBOOK.md)** - Zero-downtime DNS cutover with Replit fallback
- **[Morning New-Box Migration Guide](docs/MORNING_NEW_BOX_MIGRATION_GUIDE.md)** - Fresh-machine checklist with vendor/domain decisions
- **[Morning Migration Checklist](docs/MORNING_NEW_BOX_MIGRATION_CHECKLIST.md)** - Execution-only checklist for fast cutover
- **[Branding and Fallback Modularity](docs/BRANDING.md)** - Logo paths and host-pivot guardrails
- **[Per-Time Activity Association Test Plan](docs/PER_TIME_ACTIVITY_ASSOCIATION_TEST_PLAN.md)** - Active-user gating metrics and premium-affinity validation fixtures

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

For a migration path away from Replit with cost-control guardrails, see [`docs/DEPLOYMENT_MIGRATION_PLAN.md`](docs/DEPLOYMENT_MIGRATION_PLAN.md).
For a step-by-step zero-downtime procedure, use [`docs/CUTOVER_RUNBOOK.md`](docs/CUTOVER_RUNBOOK.md).

## Pending / Not Yet Implemented

The following roadmap items are intentionally still open:

- Full cloud object storage integration (S3/R2 direct signed upload) instead of filesystem-backed object storage
- Production malware/AV scanning integration (current scan is signature/content guard, not external AV)
- Billing provider integration for live invoice payments/webhooks (foundation routes exist)
- Wider in-app analytics/event visualization beyond admin security and usage/storage surfaces
- Additional high-signal anomaly rules and automated alert delivery channels (email/Slack/Pager)

## License

MIT License - see LICENSE file for details

---

**Need help?** Check the [documentation](docs/) or review the [architecture guide](docs/ARCHITECTURE.md) for technical details.
