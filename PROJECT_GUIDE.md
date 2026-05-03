# AxTask — Intelligent Task Management System

> **AGENT NOTE:** Read `AGENT_GUARDRAILS.md` and the `## AGENT GUARDRAILS — READ FIRST` section in `replit.md` before making any changes to auth, deployment, config, or domain-related code.

## Overview

AxTask is a full-stack intelligent task management application built with React and Express that features an automated priority scoring engine. The system calculates task priorities based on content analysis, keyword detection, deadline proximity, and user-defined urgency/impact/effort scores. It serves as a comprehensive productivity platform with gamification, real-time collaboration, AI assistance, community features, and enterprise-grade security.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **UI Components**: shadcn/ui (built on Radix UI primitives) with Tailwind CSS
- **State Management**: TanStack Query v5 for server state, React useState for local UI state
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod schema validation (`zodResolver`)
- **Animations**: Framer Motion (respects `prefers-reduced-motion`)
- **Build System**: Vite for fast development and optimised production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js (TypeScript, ES modules)
- **Database**: PostgreSQL (Replit Helium) with Drizzle ORM
- **API Design**: RESTful API with JSON responses; WebSocket for real-time collaboration
- **Session Management**: PostgreSQL-backed sessions via `connect-pg-simple`
- **Validation**: Zod schemas on both client and server
- **Security Middleware**: `helmet` (security headers + CSP + HSTS), `express-rate-limit`

### Authentication — Four-Tier Cascade

AxTask supports **four authentication providers** in a priority cascade. The active provider is selected via `AUTH_PROVIDER` env var, with automatic fallback based on available credentials:

| Tier | Provider | When Active |
|------|----------|-------------|
| 1 | **WorkOS AuthKit** | `WORKOS_API_KEY` + `WORKOS_CLIENT_ID` set |
| 2 | **Google OAuth 2.0** | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` set |
| 3 | **Replit OIDC** | `REPL_ID` available (supports Google/GitHub/Apple via Replit) |
| 4 | **Local email/password** | Always available (Passport.js + bcrypt) |

OAuth security controls vary by provider. Replit OIDC uses PKCE (S256) and validates state via `openid-client`'s `authorizationCodeGrant`. WorkOS and Google generate state tokens and store them in session but do not currently validate the returned `state` query parameter in callbacks — this is a known gap for a future security hardening task. OAuth routes live in `server/auth-providers.ts`. Passport.js strategy and session serialisation live in `server/auth.ts`.

**MFA (TOTP)**: Available for all local accounts. Secrets encrypted at rest with AES-256-GCM. Users configure via authenticator apps (Google Authenticator, Authy, etc.). Required for destructive Danger Zone operations.

**Do not restructure the auth cascade.** It is working in production.

### Security Architecture
- **Password hashing**: bcrypt
- **Account lockout**: Automatic after repeated failed logins
- **User banning**: Admin-controlled ban system with audit logging
- **Session hardening**: httpOnly cookies, `secure: true` in production, `sameSite: lax`
- **HSTS + CSP**: Enforced in production via `helmet`
- **Rate limiting**: On auth routes and general API via `express-rate-limit`
- **Security audit logging**: All significant auth events written to `security_audit_log` table
- **Security Admin UI**: Admin interface for user management and audit log review

### Core Features

- **Priority Engine**: Scoring algorithm using urgency × impact ÷ effort, keyword bonuses, tag multipliers, deadline proximity, and crisis detection
- **Calendar Views**: Interactive task scheduling with drag-and-drop rescheduling
- **Task Recurrence**: Configurable schedules (daily, weekly, custom day/date patterns)
- **Task Attachments**: Image uploads (JPEG/PNG/GIF/WebP, 5 MB, 3 per task) with thumbnails and lightbox
- **Import/Export**: Excel/CSV bulk import, export, PDF print checklists, OCR scan (Tesseract.js)
- **Data Migration Toolkit**: Full DB export/import with referential integrity validation
- **AI Planner Agent**: Daily briefings, recommended tasks, weekly calendars, conversational Q&A
- **Pattern Learning Engine**: RAG-style user history intelligence for task suggestions
- **Voice Input**: Browser Web Speech API for dictation; Ctrl+M global voice command
- **Real-time Collaboration**: WebSocket-based multi-user task editing with live presence and role-based permissions
- **Task Review Engine**: Bulk task management via voice/text with natural language parsing
- **AxCoin Economy**: Gamification currency — earned via completions, streaks, achievements; spent on Streak Shields, Priority Boost, Task Bounties, Coin Gifting
- **Analytics Dashboard**: Task distribution, priority trends, completion rates, classification breakdowns
- **Interactive Feedback System**: Micro-surveys with contextual triggers, thumbs reactions, AxCoin rewards
- **NodeWeaver Integration (Scaffolded)**: Feedback classification pipeline at `server/engines/nodeweaver-engine.ts`
- **Community Forum**: Social feed with posts, comments, emoji reactions, voting, moderation, and gamification integration
- **Interactive Tutorial**: Guided walkthrough with universal glow system
- **Accessibility**: Full keyboard navigation, UI scale control, dark/light mode, reduced-motion support

### Data Architecture

- **Schema**: Defined in `shared/schema.ts` using Drizzle ORM table definitions and Zod insert schemas
- **Key tables**: `users`, `tasks`, `sessions`, `axcoins`, `achievements`, `task_attachments`, `task_recurrences`, `collaboration_sessions`, `forum_posts`, `forum_comments`, `forum_votes`, `forum_reports`, `feedback_classifications`, `classification_disputes`, `security_audit_log`, and more
- **Priority calculation**: Server-side, keyword classification, tag detection, time sensitivity, Jaccard similarity for duplicate detection

### Deployment Architecture

- **Platform**: Replit Autoscale (Google Cloud Run)
- **Production domains**: `axtask.app` (primary), `axtask.dev` (secondary)
- **Port**: Single port `5000` → external `80`
- **Stateless**: All persistent state in PostgreSQL; no server-side memory or disk
- **Build**: `npm run build` → `dist/index.js` (backend) + `dist/public/` (frontend)

## External Dependencies

### Authentication
- `passport`, `passport-local` — local auth strategy
- `bcrypt` — password hashing
- `@workos-inc/node` — WorkOS AuthKit
- `openid-client` — Replit OIDC
- `express-session`, `connect-pg-simple` — PostgreSQL sessions
- `express-rate-limit` — rate limiting
- `helmet` — security headers

### Database
- **PostgreSQL** — Replit Helium
- **Drizzle ORM** — type-safe ORM and schema management

### File Processing
- `papa-parse` — CSV parsing
- `xlsx` — Excel file processing
- `pdfkit` — PDF generation
- `multer` — file uploads
- `sharp` — image thumbnail generation
- `tesseract.js` — OCR

### UI Libraries
- `@radix-ui/*` — accessible headless UI primitives
- `lucide-react` — icons
- `recharts` — data visualisation
- `date-fns` — date manipulation
- `framer-motion` — animations

### MFA / TOTP
- `otpauth` — TOTP code generation and verification
- `qrcode` — QR code generation for MFA setup

### Real-time
- `ws` — WebSocket server for collaboration

### State Management
- `@tanstack/react-query` v5 — server state management
- `wouter` — client-side routing
- `react-hook-form` + `@hookform/resolvers` — form handling
