# AxTask — System Architecture

> **AGENT NOTE:** Domain and deployment configuration are managed externally and must not be modified. Read `AGENT_GUARDRAILS.md` before making any changes to auth, deployment, config, or database-related code.

## Overview

AxTask is a stateless, full-stack task management platform deployed on Replit Autoscale (Google Cloud Run). All persistent state lives in PostgreSQL. The frontend is a React SPA served by the same Express process that handles the API, both on port 5000.

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                       Browser (Client)                           │
│  React 18 + TypeScript                                           │
│  ├── shadcn/ui + Radix UI components                             │
│  ├── Wouter (routing)                                            │
│  ├── TanStack Query v5 (server state + caching)                  │
│  ├── React Hook Form + Zod (forms)                               │
│  ├── Framer Motion (animations)                                  │
│  └── WebSocket client (real-time collaboration)                  │
└──────────────────────────────────────────────────────────────────┘
                              │ HTTPS / WSS
                              │
┌──────────────────────────────────────────────────────────────────┐
│                   Express Server (Node.js)                       │
│  ├── REST API (/api/*)                                           │
│  ├── WebSocket server (collaboration)                            │
│  ├── Auth routes (WorkOS / Google / Replit OIDC / Local)        │
│  ├── Passport.js + express-session                               │
│  ├── helmet (security headers, CSP, HSTS)                        │
│  ├── express-rate-limit                                          │
│  ├── Zod validation middleware                                   │
│  ├── Priority Engine                                             │
│  ├── Pattern Learning Engine                                     │
│  ├── NodeWeaver feedback classifier (scaffolded)                 │
│  └── Static file serving (dist/public in production)            │
└──────────────────────────────────────────────────────────────────┘
                              │ SQL
                              │
┌──────────────────────────────────────────────────────────────────┐
│                  PostgreSQL (Replit Helium)                      │
│  ├── users, tasks, sessions                                      │
│  ├── task_attachments, task_recurrences                          │
│  ├── collaboration_sessions, collaboration_participants          │
│  ├── axcoins, achievements, streaks, reward_shop_items           │
│  ├── forum_posts, forum_comments, forum_votes, forum_reports     │
│  ├── feedback_surveys, feedback_classifications                  │
│  ├── classification_disputes, classification_dispute_votes       │
│  ├── category_review_triggers                                    │
│  ├── security_audit_log                                          │
│  └── (many more — see shared/schema.ts for canonical list)      │
└──────────────────────────────────────────────────────────────────┘
```

---

## Deployment Model

| Property | Value |
|----------|-------|
| Platform | Replit Autoscale (Google Cloud Run) |
| Primary domain | `axtask.app` (canonical; `server/index.ts` has stale `axtask.replit.app` — needs code update) |
| Secondary domain | `axtask.dev` |
| Exposed port | `5000` → external `80` |
| Build output | `dist/index.js` (backend) + `dist/public/` (frontend) |
| Build command | `npm run build` (Vite frontend + esbuild backend) |
| Start command | `npm run start` |
| Process model | Single Node.js process, stateless |
| Persistence | 100% PostgreSQL — no in-memory or on-disk state |

**The deployment configuration lives in `.replit` and is managed externally. Do not edit `.replit`, `vite.config.ts`, `server/vite.ts`, `drizzle.config.ts`, or the scripts in `package.json`.**

---

## Authentication Architecture

AxTask implements a **four-tier authentication cascade**. The active provider is determined at startup by the `AUTH_PROVIDER` environment variable, falling back to automatic detection from available credentials.

```
┌─────────────────────────────────────────────────────────────────┐
│               Auth Provider Selection at Startup                │
│                                                                 │
│  AUTH_PROVIDER=workos → WorkOS AuthKit (Tier 1)                │
│  AUTH_PROVIDER=google → Google OAuth 2.0 (Tier 2)             │
│  AUTH_PROVIDER=replit → Replit OIDC (Tier 3)                  │
│  AUTH_PROVIDER=local  → Local email/password (Tier 4)         │
│                                                                 │
│  Auto-detect (no AUTH_PROVIDER set):                           │
│    WORKOS_API_KEY + WORKOS_CLIENT_ID present → WorkOS          │
│    GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET present → Google    │
│    REPL_ID present → Replit OIDC                               │
│    Otherwise → Local                                           │
└─────────────────────────────────────────────────────────────────┘
```

All available providers register routes at startup — the cascade allows multiple providers to coexist. OAuth security controls vary by provider: only Replit OIDC validates the CSRF state token and uses PKCE; WorkOS and Google generate state tokens but do not validate them in callbacks (a known gap). Key files:

- `server/auth-providers.ts` — all OAuth/OIDC route handlers
- `server/auth.ts` — Passport.js strategy and session serialisation
- `server/storage.ts` — `findOrCreateOAuthUser`, `isUserBanned`, `logSecurityEvent`

### OAuth Security Controls
- PKCE (S256) on Replit OIDC flows
- Random state token (CSRF protection) on all OAuth flows
- Redirect URI bound to session and verified on callback
- Ban check on every successful OAuth callback

### MFA / TOTP
- TOTP-based two-factor authentication via `otpauth`
- Secrets encrypted at rest using AES-256-GCM
- QR code enrolment via `qrcode`
- Required for destructive Danger Zone operations

---

## Frontend Architecture

### Component Hierarchy

```
App (Root)
├── ThemeProvider (dark/light mode + localStorage sync)
├── QueryClientProvider (TanStack Query)
└── Router (Wouter)
    ├── / (Dashboard)
    │   ├── QuickEntryBar
    │   ├── TaskList
    │   └── VoiceOverlay
    ├── /tasks (Full task list)
    ├── /calendar (Calendar views)
    ├── /analytics (Analytics Dashboard)
    ├── /import-export (Import/Export + OCR)
    ├── /planner (AI Planner Agent)
    ├── /rewards (AxCoin Rewards Shop)
    ├── /community (Community Forum feed)
    ├── /community/:id (Forum post detail)
    ├── /admin (Security Admin UI)
    └── /tutorial (Interactive Tutorial)
```

### State Management
- **Server state**: TanStack Query with array query keys for hierarchical cache invalidation
- **Form state**: React Hook Form with Zod resolver
- **Local UI state**: React useState
- **Global**: Context providers for theme and toast notifications

### Data Flow
1. User action → component event handler
2. Form validation → Zod schema (client-side)
3. API mutation → `apiRequest` from `@lib/queryClient`
4. Cache invalidation → `queryClient.invalidateQueries`
5. UI update → TanStack Query re-render

---

## Backend Architecture

### Request/Response Pipeline

```
HTTP/WS Request
    ↓
helmet (security headers)
    ↓
express-rate-limit
    ↓
express-session (PostgreSQL-backed)
    ↓
passport.initialize / passport.session
    ↓
JSON body parser / multer (file uploads)
    ↓
Route handlers (server/routes.ts)
    ├── Auth check (requireAuth middleware)
    ├── Zod input validation
    ├── Storage layer (server/storage.ts)
    └── Response (JSON)
    ↓
Error handler middleware
```

### Key Server Files

| File | Responsibility |
|------|---------------|
| `server/index.ts` | App bootstrap, middleware registration, health check |
| `server/routes.ts` | All API route definitions |
| `server/auth.ts` | Passport.js strategy + session serialisation |
| `server/auth-providers.ts` | OAuth/OIDC route handlers for all four providers |
| `server/storage.ts` | Database abstraction layer (IStorage interface) |
| `server/db.ts` | Drizzle ORM + PostgreSQL connection pool |
| `server/engines/priority-engine.ts` | Task scoring algorithm |
| `server/engines/pattern-engine.ts` | RAG-style pattern learning |
| `server/engines/nodeweaver-engine.ts` | Feedback classification (scaffolded) |
| `server/collaboration.ts` | WebSocket real-time collaboration server |
| `shared/schema.ts` | Drizzle table definitions + Zod insert schemas (single source of truth) |

---

## Priority Engine

```
Task Input (activity, notes, urgency, impact, effort, deadline)
    ↓
Text Analysis
    ├── Keyword detection (weighted scoring, +0.5 to +3.0)
    ├── Tag pattern matching (@urgent, #blocker, !important)
    ├── Deadline proximity analysis (time urgency bonus)
    ├── Problem indicator detection (bug, error, crisis)
    └── Content classification (Development, Meeting, Admin, etc.)
    ↓
Priority Score = (Urgency × Impact) / Effort + bonuses
    ↓
Jaccard similarity check (duplicate detection, threshold 0.7)
    ↓
Priority Level assignment:
    Highest ≥ 8.0 | High ≥ 6.0 | Medium-High ≥ 4.0 | Medium ≥ 2.0 | Low < 2.0
```

---

## Real-Time Collaboration (WebSocket)

- WebSocket server on the same port as Express (HTTP upgrade)
- `server/collaboration.ts` manages rooms, participants, and event broadcasting
- Presence indicators show active collaborators per task
- Role-based permissions (owner, editor, viewer) enforced server-side
- All collaboration state persisted to `collaboration_sessions` and `collaboration_participants` tables

---

## Voice Input Pipeline

1. **Trigger**: User presses Ctrl+M or taps the microphone button
2. **Capture**: Browser Web Speech API (`SpeechRecognition`)
3. **Mobile**: Full-screen immersive overlay with animated waveforms
4. **Intent Classification**: Transcript sent to `/api/voice/classify`
5. **Routing**: Server routes intent to task creation, planner query, or review engine
6. **Response**: Branded result card displayed to user

---

## AxCoin Economy

| Action | Coins |
|--------|-------|
| Complete a task | +5 |
| On-time completion | +2 bonus |
| Daily streak | +1 per day |
| Forum post | +5 |
| Forum comment | +2 |
| Receiving upvote | +1 |
| Classify feedback (NodeWeaver) | +3 |

**Sinks** (ways to spend coins): Streak Shield, Priority Boost, Task Bounties, Coin Gifting, Rewards Shop items.

Coin state is stored in `axcoins` table. All coin mutations go through the storage layer with atomic transactions.

---

## NodeWeaver Feedback Classifier (Scaffolded)

Engine at `server/engines/nodeweaver-engine.ts`. Processes survey responses and task reactions, classifying them as: bugs, user errors, feature requests, praise, complaints, or noise.

- `@nodeweaver-hook` placeholders mark integration points for: classification logic, enrichment, batch reprocessing, digest generation, trend detection, resolution suggestions
- DB tables: `feedback_classifications`, `classification_disputes`, `classification_dispute_votes`, `category_review_triggers`
- Dispute system: users challenge auto-classifications; consensus (≥5 disputes, ≥70% agreement) escalates to `review_needed`
- API: `/api/feedback/*`

---

## Database Schema Design

The canonical schema is in `shared/schema.ts`. Drizzle ORM handles type-safe queries and migrations via `drizzle-kit push`.

**Never drop tables or run destructive migrations without explicit user instruction.**

---

## Performance Characteristics

- Average REST response: <200 ms for CRUD operations
- Priority calculation: <150 ms per task
- Bulk import: ~50 ms per task with throttling
- File processing: streamed (no disk persistence)
- Connection pooling via Drizzle + `@neondatabase/serverless` driver

---

## Development Guidelines

### Code Organisation
```
client/src/
├── components/ui/     # shadcn/ui base components (do not customise directly)
├── components/        # Application-specific components
├── pages/             # Route-level page components
├── hooks/             # Custom React hooks
├── lib/               # Utilities (queryClient, utils)
└── assets/            # Static assets

server/
├── index.ts           # Bootstrap
├── routes.ts          # API routes
├── auth.ts            # Passport strategy
├── auth-providers.ts  # OAuth/OIDC handlers
├── storage.ts         # DB abstraction
├── db.ts              # Connection pool
├── collaboration.ts   # WebSocket
└── engines/           # Business logic engines

shared/
└── schema.ts          # Types, Drizzle tables, Zod schemas
```

### Import Conventions
- `@/` → `client/src/`
- `@shared/` → `shared/`
- `@assets/` → `attached_assets/`

### Forbidden Modifications (see AGENT_GUARDRAILS.md)
- `.replit`, `vite.config.ts`, `server/vite.ts`, `drizzle.config.ts`, `package.json` scripts
