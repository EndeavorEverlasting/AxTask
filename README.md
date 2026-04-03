
# Priority Engine Task Management System

**Version:** 1.1.0 (Google Sheets Integration)  
**Status:** Production Ready  
**Last Updated:** July 30, 2025

## Overview

A full-stack task management application with an intelligent priority scoring engine that automatically calculates task priorities based on content analysis. Features seamless Google Sheets integration for import/export workflows.

## Quick Start

```bash
npm install
npm run db:push
npm run dev
```

Visit `http://localhost:5000` to access the application.

## Key Features

- **🎯 Intelligent Priority Engine**: Automatic priority scoring based on keywords, tags, and content analysis
- **📊 Google Sheets Integration**: Real-time API sync with comprehensive setup guide
- **📈 Analytics Dashboard**: Visual insights and task metrics
- **📁 Import/Export**: CSV and Excel file support with format conversion
- **💰 Cost Monitoring**: Real-time processing cost and time estimation
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
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run db:push` - Sync database schema

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
- Cost estimation for large imports

## Security

- Input validation with Zod schemas
- SQL injection protection via parameterized queries
- Environment-based configuration
- Session management with PostgreSQL storage
- Dependency safety policy: do not add or invoke `axios`; use platform-native `fetch` for HTTP calls
- Local enforcement: enable hooks with `git config core.hooksPath .githooks` and run `npm run security:axios-guard`

## Deployment

Supports Replit and self-managed deployments with:
- Single port configuration (5000)
- Static file serving via Express
- Environment variable management
- Environment variable/secrets management
- PostgreSQL database integration
- Usage/billing monitoring and alerting recommended for production cutover

For a migration path away from Replit with cost-control guardrails, see [`docs/DEPLOYMENT_MIGRATION_PLAN.md`](docs/DEPLOYMENT_MIGRATION_PLAN.md).
For a step-by-step zero-downtime procedure, use [`docs/CUTOVER_RUNBOOK.md`](docs/CUTOVER_RUNBOOK.md).

## License

MIT License - see LICENSE file for details

---

**Need help?** Check the [documentation](docs/) or review the [architecture guide](docs/ARCHITECTURE.md) for technical details.
