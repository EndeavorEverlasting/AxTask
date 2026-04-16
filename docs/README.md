# AxTask - Intelligent Task Management System

**Version:** 1.0.0  
**Last Updated:** July 30, 2025  
**Status:** Production Ready

## Overview

AxTask is a full-stack intelligent task management application that automatically calculates task priorities using an advanced scoring engine. Originally designed to upgrade Google Sheets-based workflows, AxTask provides comprehensive task management with seamless import/export capabilities and real-time Google Sheets integration.

## Axiomatic Completion Philosophy (Canonical)

This document is the canonical philosophy source for AxTask.

AxTask is built to help users **complete** meaningful work, not only track tasks. Every engine, agent, and interface flow should prioritize:

- **Completion-first outcomes** over passive status display.
- **Clarify-before-generate behavior** whenever intent, audience, scope, or evidence is ambiguous.
- **Retrieval-grounded outputs** for reports and recommendations using RAG + classification contracts.
- **Privacy-preserving assistance** where automation never leaks private user data to public surfaces.
- **Coherent avatar experience** where orb/avatar behavior stays consistent across UI, dialogue, and automation.

### Canonical Doctrine Contracts

- [REPORT_ENGINE_AGENT_CONTRACTS.md](./REPORT_ENGINE_AGENT_CONTRACTS.md)
- [CLARIFICATION_PROTOCOL.md](./CLARIFICATION_PROTOCOL.md)
- [RAG_CLASSIFICATION_BLUEPRINT.md](./RAG_CLASSIFICATION_BLUEPRINT.md)
- [ORB_AVATAR_EXPERIENCE_CONTRACT.md](./ORB_AVATAR_EXPERIENCE_CONTRACT.md)
- [COMMUNITY_AUTOMATION_PRIVACY_CONTRACT.md](./COMMUNITY_AUTOMATION_PRIVACY_CONTRACT.md)

### Report Generation Definition Of Done

A report workflow is complete only when:

1. the agent selected the correct report mode (draft-only or guided),
2. ambiguity checks ran and clarifying questions were asked when required,
3. retrieval/classification evidence supported major claims,
4. privacy constraints were enforced for any shared/public outputs.

### Voice Personalization Doctrine (RAG)

Speech personalization is treated as a retrieval contract, not blind model retraining:

- Use correction-memory retrieval to adapt to user phrasing, accents, and dialect signals.
- Keep personalization additive and feature-flagged with baseline fallback.
- Require explicit user control (opt-in/opt-out, export, deletion).
- Apply fairness and regression checks before broad rollout.
- Enforce privacy and security constraints in:
  - [RAG_CLASSIFICATION_BLUEPRINT.md](./RAG_CLASSIFICATION_BLUEPRINT.md)
  - [COMMUNITY_AUTOMATION_PRIVACY_CONTRACT.md](./COMMUNITY_AUTOMATION_PRIVACY_CONTRACT.md)
  - [SECURITY.md](./SECURITY.md)

### Orb + Avatar Doctrine

- Floating orbs are a deliberate UX metaphor for fleeting tasks; movement should remain ambient and non-obstructive.
- Cursor-elusion should be expressive but subtle enough to preserve usability.
- Avatar identities are engine-driven personas, not user identities.
- Mood-to-color mappings must stay stable across UI and community dialogue surfaces.

### Rollout Phases

1. **Doctrine Foundation**: publish and cross-link all canonical contracts.
2. **Architecture Alignment**: align engine boundaries and fallback behavior language in architecture docs.
3. **Operational Adoption**: ensure feature specs and implementation docs reference canonical contracts.
4. **Verification**: maintain unit tests that guard canonical references and doctrine anchors.

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

**Pre-push objective-to-code checklist (rewards, classification, feedback, coins, p-score):** [OBJECTIVE_CODE_PUSH_CHECKLIST.md](./OBJECTIVE_CODE_PUSH_CHECKLIST.md)

**Database and schema command order (local vs Docker vs production), flowcharts, and flags:** [DEV_DATABASE_AND_SCHEMA.md](./DEV_DATABASE_AND_SCHEMA.md)

### Local Development
```bash
npm install           # Install dependencies
npm run db:push       # Sync Drizzle schema (run when shared/schema or DB is out of date)
npm run dev           # Start development server only (no migrations, no push)
```

For versioned SQL under `migrations/*.sql`, run `node scripts/apply-migrations.mjs` before or with your usual sync; full ordering is in [DEV_DATABASE_AND_SCHEMA.md](./DEV_DATABASE_AND_SCHEMA.md).

### One-Click Startup (Recommended for non-technical users)
- Windows users: double-click `start-offline.cmd`
- CLI users: run `npm run offline:start`
- Optional setup for Windows users: `npm run offline:shortcut` (creates a Desktop icon)
- In-app option: click `Install App Shortcut` in the sidebar to add AxTask to desktop/mobile home screen
- First-login users also get a top install CTA banner with dismiss + "don't show again"
- Auto-steps performed by `npm run offline:start` / `dev:smart` ([`tools/local/offline-start.mjs`](../tools/local/offline-start.mjs)):
  - Install dependencies if missing
  - Create `.env` via `local:env-init` when needed
  - Validate `DATABASE_URL`
  - **`node scripts/apply-migrations.mjs`** (every run)
  - Sync dependencies if lockfile / `package.json` fingerprint changed
  - **`npm run db:push`** only when the schema fingerprint changed (`shared/schema.ts`, `drizzle.config.ts`, `migrations/*.sql`)
  - Start dev server with `npx tsx server/index.ts`

### Offline Development (Commit Later)
- Use a local PostgreSQL instance so the app can run without internet
- Keep `.env` with local values (`DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV=development`)
- Make app/code changes offline
- Commit locally, then push when you are back online

### Monorepo and NodeWeaver

AxTask does **not** use git submodules for NodeWeaver. See [`NODEWEAVER.md`](NODEWEAVER.md).

- NodeWeaver is a standalone classifier product; in this repo it is **vendored** at `services/nodeweaver/upstream`.
- It runs in hybrid mode: internal-first vendored path, or optional external service URL for deployment profiles that require separation.
- Classification ownership is shared across NodeWeaver engine core and AxTask fallback/orchestration.
- The old `NodeWeaver._pre_submodule_backup` gitlink has been removed from the repository; do not restore it as a submodule.

### PR Segmentation for Review Tools

To keep automated review quality high (including CodeRabbit), prefer smaller PR slices.

- Hard CI limit: 300 changed files
- Recommended target: 200 files or less
- Split large branches by concern: schema/migrations, server API/storage, client UX, docs/tests
- Use:

```bash
node tools/local/split-pr-helper.mjs --base origin/main --max-files 200
```

Suggested mini-games PR sequence:

1. Shared schema + SQL migration + schema tests
2. Server storage/routes + server tests
3. Client mini-games page/hooks/nav + UI tests
4. Documentation/process and CI workflow updates

### Document Authority Map

- Local / Docker / production database and schema sync: [DEV_DATABASE_AND_SCHEMA.md](./DEV_DATABASE_AND_SCHEMA.md)
- Canonical index: `docs/ACTIVE_LEGACY_INDEX.md`
- Canonical architecture contract: `docs/ARCHITECTURE.md`
- Deployment-impact test sweep and debugging patterns: `docs/DEBUGGING_REFERENCE.md`
- Canonical PR/deployment slicing policy: `docs/PR_SEGMENTATION.md`
- Migration/cutover runbooks are transitional and should not override canonical architecture policy.

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