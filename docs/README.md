# AxTask documentation

**Canonical handoff:** [PRODUCT_ROADMAP.md](./PRODUCT_ROADMAP.md) — vision checklist, doc map, and ship protocol.

**Sign-in (production, Docker, local dev):** [SIGN_IN.md](./SIGN_IN.md).

## Documentation visibility and planning

- **`docs/` as a whole** has the same visibility as the rest of the repository (public if the remote is public, private if the remote is private). There is no separate “hidden docs” layer inside the tree.
- **Keep in-repo:** runbooks, templates, architecture notes, and checklists that **do not embed secrets** — for example [RENDER_WEB_SERVICE_PASTE_CHECKLIST.md](./RENDER_WEB_SERVICE_PASTE_CHECKLIST.md) (names and steps only; real values live in gitignored `.env.render` and provider dashboards) and [SIGN_IN.md](./SIGN_IN.md) (end-user login; no operator SQL or privileged URLs).
- **Keep outside the public tree:** living strategic plans, sensitive prioritization, incident postmortems with confidential detail, and other narratives that should not ship with a public clone. Maintain those in a **private internal wiki or doc system**, not as the source of truth in a public Git branch.
- **Operator / admin procedures:** committed **[`internal/OPERATOR_RUNBOOK.template.md`](./internal/OPERATOR_RUNBOOK.template.md)** (placeholders only); filled copies as **[`internal/OPERATOR_RUNBOOK.md`](./internal/OPERATOR_RUNBOOK.md)** are **gitignored** — or mirror the template into a private wiki. See **[`internal/README.md`](./internal/README.md)**.
- **Cursor `.cursor/plans/`** is gitignored so IDE-generated plan drafts stay local. That is intentional: the *infrastructure* (that teams may use Cursor, that `docs/` holds operational guides) is visible; the *plan bodies* you care to protect are not committed here.

---

# AxTask - Intelligent Task Management System

**Version:** 1.0.0  
**Last Updated:** July 30, 2025  
**Status:** Production Ready

## Overview

AxTask is a full-stack intelligent task management application that automatically calculates task priorities using an advanced scoring engine. Originally designed to upgrade Google Sheets-based workflows, AxTask provides comprehensive task management with seamless import/export capabilities and real-time Google Sheets integration.

## Architecture

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Client  │◄──►│  Express Server │◄──►│   PostgreSQL    │
│                 │    │                 │    │    Database     │
│  - Task Forms   │    │  - API Routes   │    │  - Task Storage │
│  - Priority UI  │    │  - Priority     │    │  - Session Data │
│  - Analytics    │    │    Engine       │    │                 │
│  - Import/Export│    │  - Validation   │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Technology Stack

- **Frontend:** React 18, TypeScript, TailwindCSS, shadcn/ui
- **Backend:** Node.js, Express.js, TypeScript
- **Database:** PostgreSQL with Drizzle ORM
- **State Management:** TanStack Query (React Query)
- **Validation:** Zod schemas
- **Build Tools:** Vite, esbuild

## Core Features

### 1. Priority Engine

The heart of the system - automatically calculates task priorities based on:

#### Scoring Algorithm
- **Base Score:** Urgency × Impact ÷ Effort
- **Keyword Bonuses:** Context-aware scoring for specific terms
- **Tag Detection:** @urgent, #blocker, !important, etc.
- **Time Sensitivity:** Deadline proximity analysis
- **Problem Indicators:** Bug, issue, error detection
- **Repetition Check:** Jaccard similarity to avoid duplicates

#### Priority Levels
- **Highest:** 8+ points (Critical tasks)
- **High:** 6-7 points (Important tasks)
- **Medium-High:** 4-5 points (Moderate priority)
- **Medium:** 2-3 points (Standard tasks)
- **Low:** <2 points (Nice-to-have)

### 2. Task Classification

Automatic categorization based on content analysis:
- **Development:** Code, programming, technical work
- **Meeting:** Discussions, calls, presentations
- **Administrative:** Documentation, compliance, reports
- **Bug Fix:** Issue resolution, error handling
- **Research:** Investigation, learning, analysis
- **General:** Miscellaneous tasks

### 3. Google Sheets Integration

#### Import Process
1. Export Google Sheets as CSV
2. Upload via Import/Export page
3. Automatic format detection and conversion
4. Priority calculation for each task
5. Database storage with full metadata

#### Export Process
1. Click "Export to CSV" 
2. Download file in Google Sheets format
3. Import to Google Sheets via File → Import
4. Maintains star ratings (☆☆☆☆☆) and TRUE/FALSE status

#### Supported Formats
- **CSV Files:** Standard comma-separated values
- **Excel Files:** .xlsx and .xls formats
- **Google Sheets:** Direct CSV export/import workflow

## Database Schema

### Tasks Table

```sql
CREATE TABLE tasks (
  id VARCHAR PRIMARY KEY,
  date DATE NOT NULL,
  activity TEXT NOT NULL,
  notes TEXT,
  urgency INTEGER CHECK (urgency >= 1 AND urgency <= 5),
  impact INTEGER CHECK (impact >= 1 AND impact <= 5), 
  effort INTEGER CHECK (effort >= 1 AND effort <= 5),
  prerequisites TEXT,
  status VARCHAR DEFAULT 'pending',
  priority VARCHAR DEFAULT 'Low',
  priority_score INTEGER DEFAULT 0,
  classification VARCHAR DEFAULT 'General',
  is_repeated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Data Validation

All inputs validated using Zod schemas:
- **Required:** date, activity
- **Optional:** notes, urgency (1-5), impact (1-5), effort (1-5), prerequisites
- **Auto-generated:** id, priority, priority_score, classification, timestamps

## API Endpoints

### Task Management
- `GET /api/tasks` - List all tasks
- `POST /api/tasks` - Create new task with priority calculation
- `PUT /api/tasks/:id` - Update task with priority recalculation
- `DELETE /api/tasks/:id` - Delete task
- `GET /api/tasks/:id` - Get specific task

### Analytics & Search
- `GET /api/tasks/stats` - Task statistics and metrics
- `GET /api/tasks/search/:query` - Full-text search
- `GET /api/tasks/status/:status` - Filter by status
- `GET /api/tasks/priority/:priority` - Filter by priority level

## Cost Monitoring

### Import Cost Analysis
- **Processing Time:** ~150ms per task (database + priority calculation)
- **Server Cost:** $0.02 per hour estimated
- **Large Import Warning:** Displays for 20+ tasks
- **Real-time Tracking:** Live cost and time estimates

### Cost Breakdown
```
Estimated Cost = (Tasks × Processing Time) × Server Rate
Example: 100 tasks × 150ms = 15 seconds = $0.0001
```

## User Interface

### Main Navigation
- **Dashboard:** Overview and quick stats
- **Tasks:** Full task management interface
- **Analytics:** Charts and insights
- **Import/Export:** Google Sheets integration

### Task Management Features
- **Create/Edit:** Rich form with validation
- **Priority Badges:** Color-coded priority levels  
- **Classification Tags:** Automatic task categorization
- **Status Tracking:** Pending, in-progress, completed
- **Search & Filter:** Multiple filter options
- **Bulk Operations:** Import/export capabilities

## Troubleshooting

### Common Issues

#### Import Failures
**Symptom:** Tasks fail during CSV import  
**Cause:** Invalid data format or missing required fields  
**Solution:** 
1. Check CSV format requirements
2. Ensure Date and Activity columns exist
3. Use Download Template for proper format

#### Priority Calculation Errors
**Symptom:** Priorities not calculating correctly  
**Cause:** Missing or invalid urgency/impact/effort values  
**Solution:**
1. Verify urgency, impact, effort are numbers 1-5
2. Check for null or undefined values
3. Review priority engine logs

#### Database Connection Issues
**Symptom:** 404 errors on API calls  
**Solution:**
1. Check DATABASE_URL environment variable
2. Verify PostgreSQL connection
3. Run `npm run db:push` to sync schema

#### Local Setup / `db:push` Failures
**Symptom:** `npm error Missing script: "db:push"`  
**Cause:** Command was run outside the AxTask project directory.  
**Solution:**
1. `cd` into the AxTask folder first
2. Run `npm run db:push` again

**Symptom:** `DATABASE_URL, ensure the database is provisioned`  
**Cause:** `DATABASE_URL` is not set for local tooling.  
**Solution:**
1. Create `.env` from `.env.example`
2. Set `DATABASE_URL` to a reachable PostgreSQL instance
3. Re-run `npm run db:push`

### Performance Optimization

#### Large Imports
- **Recommended:** Split files over 100 tasks
- **Processing Rate:** ~6-7 tasks per second
- **Memory Usage:** Monitor for large CSV files
- **Server Load:** Built-in delays prevent overload

#### Database Performance
- **Indexing:** Primary keys and foreign keys indexed
- **Query Optimization:** Use specific endpoints vs general queries
- **Connection Pooling:** Managed by Drizzle ORM

## Development Workflow

### Local Development
```bash
npm install           # Install dependencies
npm run db:push      # Sync database schema
npm run dev          # Start development server
```

Create `.env` first: **`npm run local:env-init`** (any OS), or copy from `.env.example` — on **Windows Command Prompt** do not use Unix `cp` (see root [README.md](../README.md#shells-windows-command-prompt-vs-git-bash--macos--linux)).

### One-Click Startup (Recommended for non-technical users)
- Windows users: double-click `start-offline.cmd`
- CLI users: run `npm run offline:start`
- Optional setup for Windows users: `npm run offline:shortcut` (creates a Desktop icon)
- In-app option: click `Install App Shortcut` in the sidebar to add AxTask to desktop/mobile home screen
- First-login users also get a top install CTA banner with dismiss + "don't show again"
- Auto-steps performed:
  - Install dependencies if missing
  - Create `.env` from `.env.example` if needed
  - Validate `DATABASE_URL`
  - Run `npm run db:push`
  - Start dev server

### Offline Development (Commit Later)
- Use a local PostgreSQL instance so the app can run without internet
- Keep `.env` with local values (`DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV=development`)
- Make app/code changes offline
- Commit locally, then push when you are back online

### Offline Phase A (read cache + UI)
- Persisted TanStack Query reads to `localStorage`, with sensitive API roots excluded; logout clears persisted buckets. Per-user keys and extra safeguards are in **[OFFLINE_PHASE_D.md](./OFFLINE_PHASE_D.md)**. See **[OFFLINE_PHASE_A.md](./OFFLINE_PHASE_A.md)** for behavior, `VITE_QUERY_PERSIST_BUSTER`, and the short **task conflict policy** for future sync phases.
- **Docker:** `VITE_QUERY_PERSIST_BUSTER` is applied at **image build** via Compose (`.env.docker`); rebuild after bumping it — **[DOCKER_FOUNDATION.md](./DOCKER_FOUNDATION.md#offline-phase-a-read-cache-and-rebuilds)**.

### Offline Phase B (device refresh session)
- HttpOnly `axtask.drefresh` + `POST /api/auth/refresh` restores Passport when the session cookie is gone but the device token is valid. Requires `device_refresh_tokens` table (`npm run db:push`). See **[OFFLINE_PHASE_B.md](./OFFLINE_PHASE_B.md)**.
- **Docker:** the **`migrate`** service runs `db:push` (includes `device_refresh_tokens`). Details — **[DOCKER_FOUNDATION.md](./DOCKER_FOUNDATION.md#offline-phase-b-device-refresh-database)**.

### Offline Phase C (task mutation queue + conflicts)
- Offline-first **task** creates/updates/deletes/reorder plus queued **raw** API calls for checklist, review apply, classification, sharing, etc. Server **`baseUpdatedAt`** / **`409 task_conflict`** with resolution dialog. See **[OFFLINE_PHASE_C.md](./OFFLINE_PHASE_C.md)**.

### Offline Phase D (safe query persistence)
- Per-user `localStorage` keys, broader persist denylist, bounded serialization, and one-time legacy key migration. See **[OFFLINE_PHASE_D.md](./OFFLINE_PHASE_D.md)**.

### Local secrets and account transition
- **`npm run local:env-init`** / **`npm run local:secrets-bootstrap`**: auto-fill `SESSION_SECRET` in `.env` without printing it. See **[LOCAL_ACCOUNT_TRANSITION.md](./LOCAL_ACCOUNT_TRANSITION.md)** for moving from seed dev users to a real email on local Postgres.

### Engine APIs
- `POST /api/feedback/process` — process message text through feedback engines (classification, sentiment, priority, tags, actions)
- `POST /api/classification/classify` — universal classifier API with external + local fallback layers

### Admin Feedback Inbox Triage
- Supports advanced filtering (priority/review state/reviewer/tags)
- Supports sort modes (newest/oldest/critical-first)
- Includes bulk review-state updates for filtered rows
- Exports filtered results to CSV for external workflow/reporting
- Allows saving/loading local filter presets

### Environment Variables
```bash
DATABASE_URL=postgresql://user:pass@host:port/db
NODE_ENV=development
PGHOST=localhost
PGPORT=5432
PGDATABASE=taskflow
PGUSER=user
PGPASSWORD=password
```

### Code Structure
```
├── client/src/
│   ├── components/     # Reusable UI components
│   ├── pages/         # Route components
│   ├── lib/           # Utilities and business logic
│   └── hooks/         # Custom React hooks
├── server/
│   ├── routes.ts      # API endpoint definitions
│   ├── storage.ts     # Database abstraction layer
│   └── db.ts          # Database connection setup
├── shared/
│   └── schema.ts      # Shared types and validation
└── docs/              # Documentation
```

## Deployment

### Database migration (production)

- **[PRODUCTION_DB_MIGRATION_STRATEGY.md](./PRODUCTION_DB_MIGRATION_STRATEGY.md)** — overview and links (branch **U**, backups, verify-schema, cutover).
- **[MIGRATION_AUTOMATION.md](./MIGRATION_AUTOMATION.md)** — npm scripts and PowerShell backup/restore.
- **[STAGING_CUTOVER_RUNBOOK.md](./STAGING_CUTOVER_RUNBOOK.md)** — staging validation and production cutover steps.

### Production Build
```bash
npm run build        # Build client and server
npm start           # Start production server
```

### Environment Setup
- **Database:** PostgreSQL 12+ required
- **Node.js:** Version 18+ required  
- **Memory:** 512MB minimum recommended
- **Storage:** Minimal requirements for task data

### Monitoring
- **Server Logs:** Express request/response logging
- **Error Tracking:** Console error logging
- **Performance:** Built-in timing for imports
- **Cost Tracking:** Real-time cost estimation

## Version History

### v1.0.0 (July 30, 2025)
- Initial production release
- PostgreSQL database integration
- Google Sheets import/export
- Priority engine with keyword detection
- Cost monitoring system
- Real-time import progress tracking
- Comprehensive error handling
- Mobile-responsive design

## Maintenance

### Regular Tasks
- **Database Backups:** Implement regular PostgreSQL backups
- **Dependency Updates:** Monitor for security updates
- **Performance Monitoring:** Track import/export performance
- **Error Log Review:** Check for recurring issues

### Future Enhancements
- **Batch Import API:** Server-side batch processing
- **Advanced Analytics:** More detailed reporting
- **Team Collaboration:** Multi-user support
- **Mobile App:** Native mobile application
- **API Integration:** Third-party service connections

## Support

### Getting Help
1. Check this documentation first
2. Review error logs in browser console
3. Verify environment variable configuration
4. Test with small sample imports before large files

### Reporting Issues
Include the following information:
- Error messages or screenshots
- Steps to reproduce
- File formats and sizes (for import issues)
- Browser and operating system details