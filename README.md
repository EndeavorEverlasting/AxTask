
# AxTask — Priority Engine Task Management System

**Version:** 1.2.0 (see `VERSION.md` for changelog)  
**Status:** Production (Live at [axtask.app](https://axtask.app) and [axtask.dev](https://axtask.dev))  
**Last Updated:** May 2026

---

> ### ⚠️ AGENT / DEVELOPER GUARDRAILS
>
> Before making any change to this repository, read **`AGENT_GUARDRAILS.md`** and the **`## AGENT GUARDRAILS — READ FIRST`** section in `replit.md`.
>
> **Forbidden files — never edit without explicit user approval:**
> `.replit` · `vite.config.ts` · `server/vite.ts` · `drizzle.config.ts` · `package.json` (scripts)
>
> **Protected domains — managed externally, never reconfigure:**
> `axtask.app` · `axtask.dev`

---

## Overview

AxTask is a full-stack intelligent task management application with a sophisticated priority scoring engine that automatically ranks tasks based on content analysis, keywords, tags, deadlines, and effort. It is designed for teams and individuals who need a structured, data-driven approach to productivity.

## Quick Start

```bash
npm install
npm run db:push
npm run dev
```

Visit `http://localhost:5000` to access the application.

## Current Feature Set

### Core Task Management
- **Intelligent Priority Engine** — Automatic scoring using urgency × impact ÷ effort, keyword/tag bonuses, deadline proximity, and crisis detection
- **Calendar Views** — Interactive task scheduling with drag-and-drop rescheduling
- **Task Recurrence** — Configurable recurrence schedules (daily, weekly, custom day/date patterns)
- **Task Attachments** — Image uploads (JPEG/PNG/GIF/WebP, 5 MB limit, 3 per task) with drag-drop, thumbnails, and lightbox
- **Rich Content Editor** — Markdown content editor per task

### Import / Export
- **Excel & CSV Import** — Bulk import with server-side batch processing and progress tracking
- **Export** — Export tasks to Excel/CSV
- **Print Checklist** — Generates printable PDF task checklists
- **OCR Scanning** — Scan printed checklists back in with Tesseract.js OCR
- **Data Migration Toolkit** — Full database export/import with referential integrity validation

### AI & Intelligence
- **AI Planner Agent** — Daily briefings, recommended tasks, weekly mini-calendars, and conversational Q&A
- **Pattern Learning Engine** — RAG-style intelligence that learns from task history to suggest topics, recurring tasks, and deadlines
- **Voice Input** — Browser-native Web Speech API for task dictation
- **Universal Voice Command System** — Global Ctrl+M hotkey with intent classification (create task, query planner, etc.)
- **Immersive Mobile Voice Overlay** — Full-screen mobile voice experience with animated waveforms

### Collaboration
- **Real-time Collaboration** — Google Drive-style collaborative task editing via WebSocket with live presence indicators and role-based permissions
- **Task Review Engine** — Voice/text-driven bulk task management with natural language parsing

### Gamification — AxCoin Economy
- **AxCoins** — Earned by completing tasks, streaks, achievements, and classifications
- **On-time Bonuses & Streaks** — Streak tracking with Streak Shield consumables
- **Rewards Shop** — Priority Boost, Task Bounties, Coin Gifting, and more
- **Achievements** — Unlockable badges tied to task behaviour

### Analytics & Insights
- **Analytics Dashboard** — Visual charts for task distribution, priority trends, completion rates, and classification breakdowns
- **Interactive Feedback System** — Micro-surveys (thumbs/radio/text) with contextual triggers and AxCoin rewards

### Community
- **Community Forum** — Social feed with posts (markdown), categories, upvotes/downvotes, emoji reactions, threaded comments, pagination, and moderation tools

### Accessibility & UX
- **Mobile Responsive** — Full mobile device compatibility
- **Dark Mode** — System-aware with manual toggle
- **Keyboard Navigation** — Full keyboard support including Ctrl+Space+N for new tasks
- **UI Scale Control** — Adjustable interface scale
- **Interactive Tutorial** — Guided walkthrough with universal glow system
- **Proactive Field Glow Warnings** — Visual cues for empty required fields

### Administration
- **Security Admin UI** — User management, account banning, and audit log viewer
- **NodeWeaver Integration (Scaffolded)** — Feedback classification pipeline for bugs, feature requests, and noise detection with dispute/voting system

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + shadcn/ui + Tailwind CSS |
| Routing | Wouter |
| State | TanStack Query v5 |
| Forms | React Hook Form + Zod |
| Animations | Framer Motion |
| Backend | Node.js + Express.js (TypeScript, ES modules) |
| Database | PostgreSQL (Replit Helium) via Drizzle ORM |
| Sessions | connect-pg-simple (PostgreSQL-backed) |
| Auth | Passport.js + WorkOS + Google OAuth + Replit OIDC + bcrypt |
| MFA | otpauth (TOTP) + AES-256-GCM encryption |
| Security | helmet, express-rate-limit, bcrypt |
| File Processing | Papa Parse, xlsx, pdfkit, multer, sharp, Tesseract.js |
| Real-time | WebSocket (ws) |
| Build | Vite (frontend) + esbuild (backend) |

## Authentication Providers

AxTask uses a four-tier authentication cascade:

```
Tier 1: WorkOS AuthKit       (enterprise SSO)
Tier 2: Google OAuth 2.0     (consumer Google accounts)
Tier 3: Replit OIDC          (Google/GitHub/Apple via Replit identity)
Tier 4: Local email/password (Passport.js + bcrypt — always available)
```

The active provider is selected at runtime via the `AUTH_PROVIDER` environment variable. MFA (TOTP) is available for all local accounts with secrets encrypted at rest.

## Architecture Summary

```
React Client ↔ Express API ↔ PostgreSQL (Replit Helium)
      ↓              ↓              ↓
  shadcn/ui      REST + WS     Drizzle ORM
  TanStack Q     Passport.js   connect-pg-simple
  Wouter         helmet/rl     Sessions + Users
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full architecture description.

## Deployment

Deployed on **Replit Autoscale** (Google Cloud Run):
- **Primary domain**: `axtask.app`
- **Secondary domain**: `axtask.dev`
- Single port: `5000` → external `80`
- Build: `npm run build` → `dist/index.js` + `dist/public/`
- Stateless — all state in PostgreSQL

## Documentation

| Document | Description |
|----------|-------------|
| [`AGENT_GUARDRAILS.md`](AGENT_GUARDRAILS.md) | Hard rules for agents and developers |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Full technical architecture |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Security posture and controls |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Release notes |
| [`replit.md`](replit.md) | Live system reference (agents read this) |

## Development Scripts

```bash
npm run dev        # Start development server (frontend + backend)
npm run build      # Build for production
npm run start      # Start production server
npm run db:push    # Sync database schema
```

## License

MIT License — see LICENSE file for details.
