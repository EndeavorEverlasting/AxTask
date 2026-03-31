# AxTask — Priority Engine Task Management System

## Overview

A full-stack intelligent task management application that automatically calculates task priorities using an advanced scoring engine. The system analyzes task content, keywords, tags, and other factors to assign priorities automatically, reducing manual effort and improving task organization.

## User Preferences

Preferred communication style: Simple, everyday language.

## Top Priorities

1. **No browser security false positives**: The app must not trigger browser security tools (Malwarebytes Threat Protection Pro, Norton Safe Web, etc.). All URLs, redirects, and content security headers must be clean and trustworthy. This is a user-facing production app — false positives are unacceptable.
2. **Clean, professional URLs**: Avoid exposing long dev domain URLs (e.g., `.spock.replit.dev`) to end users. Production should use clean `axtask.replit.app` paths. Consider custom domain support in the future.

## System Architecture

### UI/UX Decisions
- **Framework**: React 18 with TypeScript
- **UI Components**: shadcn/ui built on Radix UI with Tailwind CSS for styling
- **Responsive Design**: Full mobile device compatibility
- **Accessibility**: Dynamic focus glow system using CSS `:has()`, auto-focus for quick entry, improved button labels, and full keyboard navigation.
- **Zoom**: UI scale control for accessibility

### Technical Implementations
- **Frontend State Management**: TanStack Query for server state management, caching, and data synchronization.
- **Routing**: Wouter for lightweight client-side routing.
- **Form Handling**: React Hook Form with Zod schema validation.
- **Build System**: Vite for frontend, esbuild for backend.
- **Backend Runtime**: Node.js with Express.js (TypeScript, ES modules).
- **Database**: PostgreSQL with Drizzle ORM (local Replit Helium database, using `pg` driver).
- **API Design**: RESTful API with JSON responses and CRUD operations.
- **Session Management**: PostgreSQL-backed session storage using connect-pg-simple.
- **Validation**: Zod schemas for client and server-side request/response validation.

### Feature Specifications
- **Priority Engine**: Intelligent scoring algorithm based on urgency, impact, effort, keywords, tags, deadline, and crisis detection. Crisis keywords (help, death, dying, emergency, safety, OSHA, etc.) auto-flag as "Highest" priority with "Crisis" classification. Future: integrate NodeWeaver or open-source NLP classifier for deeper semantic analysis.
- **Calendar Views**: Multiple time-based views with interactive task management, drag-and-drop rescheduling.
- **Import/Export System**: Bulk Excel/CSV import with multi-sheet support (Daily Planner, Archives, Vault), server-side batch processing via `POST /api/tasks/import`, Excel serial date conversion, and per-sheet selection UI. CSV export also supported.
- **Print Checklist & OCR**: Generate printable PDF daily checklists (`GET /api/checklist/:date`), then upload a photo of the completed checklist for OCR scanning (`POST /api/checklist/scan` via Tesseract.js) to automatically identify checked-off tasks and batch-update their status (`POST /api/checklist/apply`). Designed for users who prefer pen-and-paper workflows.
- **AI Planner Agent**: Intelligent planning panel accessible from the sidebar. Features daily briefing (overdue count, due-today, this-week totals), top-3 recommended tasks with priority reasoning (deadline proximity + priority score weighting), weekly mini-calendar with color-coded load indicators (light/moderate/heavy), and a conversational Q&A interface for natural language queries ("What's most urgent?", "Show overdue tasks", "Summarize my week"). Notification badge on the sidebar icon shows overdue task count with 60s polling. Endpoints: `GET /api/planner/briefing`, `POST /api/planner/ask`.
- **Analytics Dashboard**: Visual insights into task metrics, completion rates, and priority distributions.
- **Real-time Updates**: Optimistic updates and cache invalidation.
- **Task Reordering**: Drag-and-drop task reordering with persistent sort order.
- **Task Search**: Full-text search across activity, notes, and classification with 200ms debounce.
- **Performance Optimizations**: React.memo on task rows with reference equality comparison, debounced search input, SQL aggregate queries for dashboard stats, bulk task update method for imports, database indexes on (userId, status), (userId, priority), (userId, sortOrder).
- **Animations**: framer-motion for task list entrance/exit/reorder animations (AnimatePresence + layout), status/priority change flash effects (CSS keyframes), dashboard stat count-up on load, drag-and-drop scale-up on grab. All animations respect `prefers-reduced-motion`. Virtualized tables (100+ tasks) disable layout animations for performance.
- **Voice Input**: Browser-native speech recognition (Web Speech API) for dictating task activity and notes. Mic buttons appear next to Activity and Notes fields. Supports voice commands: "priority high/medium/low", "due today/tomorrow/next week", "mark as completed/in-progress", "tag it as [name]". Graceful degradation — mic buttons hidden in unsupported browsers. Real-time interim transcript display while speaking. Key files: `client/src/hooks/use-speech-recognition.ts`, `client/src/lib/voice-commands.ts`, `client/src/components/mic-button.tsx`.
- **Universal Voice Command System**: Global voice command bar (VoiceCommandBar) accessible from any page via Ctrl+M or the mic icon in the sidebar. The VoiceProvider context wraps the app, making speech recognition state available to all components. Transcribed text is sent to `POST /api/voice/process` which routes it through the Audio-to-Engine dispatcher. Engines:
  - **Dispatcher** (`server/engines/dispatcher.ts`): Classifies intent from transcribed text using keyword/regex patterns into categories: task_create, planner_query, calendar_command, navigation, search.
  - **Calendar Engine** (`server/engines/calendar-engine.ts`): Parses schedule-related commands (reschedule, query-by-date, create-on-date) with day-name resolution.
  - **Planner Engine** (`server/engines/planner-engine.ts`): Refactored from inline `/api/planner/ask` logic. Handles urgency queries, overdue, due-today, weekly summaries, status overviews, and text search.
  - All engines return structured responses (`{ intent, action, payload, message }`) that the frontend acts on (navigate, prefill task forms, display answers, reschedule tasks).
  - Frontend response handler in `client/src/hooks/use-voice.tsx` handles navigation, task pre-fill, and calendar rescheduling actions.

### Authentication & Security
- **Multi-tier Auth**: Four authentication providers always visible on the login page. `AUTH_PROVIDER` env var overrides auto-detect when set explicitly. Auto-detection fallback order: WorkOS → Google → Replit → Local.
  - **Tier 1 (Google)**: Google OAuth 2.0 (auto-detected if `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` set)
  - **Tier 2 (Replit)**: Replit OIDC — Google/GitHub/Apple via Replit identity (auto-detected if `REPL_ID` set)
  - **Tier 3 (WorkOS)**: WorkOS AuthKit — enterprise SSO (auto-detected if `WORKOS_API_KEY` + `WORKOS_CLIENT_ID` set)
  - **Tier 4 (Local)**: Hardened Passport.js email/password with bcrypt (fallback, always available)
  - **Login page**: All four options always shown (Google, Replit, WorkOS, Email/Password) regardless of server config. OAuth routes gate by credential availability, not by active provider.
- **Registration Control**: `REGISTRATION_MODE` env var — "open", "invite" (requires `INVITE_CODE`), or "closed"
- **Account Lockout**: 5 failed attempts → 15-minute lockout with security logging
- **Password Policy**: Minimum 8 chars, uppercase, lowercase, digit, special character
- **Security Questions**: Optional password recovery via user-set security questions
- **Password Reset Tokens**: SHA-256 hashed tokens with expiry, stored in database
- **Admin Role**: Admin users can reset any user's password
- **Rate Limiting**: Auth endpoints rate-limited (10 login/15min, 3 register/hr)
- **Session Security**: httpOnly cookies, secure flag in production, 7-day expiry, non-default cookie name
- **HTTPS Protocol**: Production enforces HTTPS via 301 redirect, HSTS (2yr max-age, preload), upgrade-insecure-requests
- **Content Security Policy**: Strict CSP in production — self-only with Google OAuth endpoints whitelisted; disabled in dev for Vite HMR
- **Security Headers**: Helmet.js v8 — X-Frame-Options DENY, strict-origin-when-cross-origin referrer, nosniff, no X-Powered-By, no cross-domain policies
- **Dev Accounts**: Auto-seeded in development with ephemeral passwords (regenerated on restart)
- **Persistent Login Provider Memory**: The login page remembers the user's preferred authentication provider and known accounts to streamline re-authentication. A togglable "Remember my login method" preference controls this behavior.
  - **What IS stored in localStorage**: Display name, email address, provider type string (e.g. "google", "local"), last-used timestamp, and the remember-provider preference flag. These are non-sensitive display metadata only.
  - **What is NOT stored**: No passwords, authentication tokens, session cookies, OAuth access/refresh tokens, or any credentials are ever written to localStorage. All authentication state remains server-side in httpOnly session cookies managed by Passport.js.
  - **Security rationale**: Storing only provider-type strings and display metadata poses no credential-leak risk. Even if localStorage is compromised (XSS), no authentication material is exposed. The actual authentication always goes through the full OAuth flow or password verification on the server.

### Database Schema
- **users**: id, email, passwordHash, displayName, role, authProvider, workosId, googleId, replitId, profileImageUrl, securityQuestion, securityAnswerHash, failedLoginAttempts, lockedUntil, createdAt
- **password_reset_tokens**: id, userId, tokenHash, method, expiresAt, usedAt, createdAt
- **tasks**: id, userId, date, time, activity, notes, urgency, impact, effort, prerequisites, priority, priorityScore, classification, status, isRepeated, sortOrder, createdAt, updatedAt
- **session**: managed by connect-pg-simple (excluded from drizzle migrations)

### Key Files
- `server/auth.ts` — Passport.js local strategy setup, session config, requireAuth middleware
- `server/auth-providers.ts` — Multi-provider abstraction (Google OAuth, WorkOS, local)
- `server/storage.ts` — All database operations (users, tasks, password reset, security questions)
- `server/seed-dev.ts` — Dev account seeder (only in development mode)
- `server/routes.ts` — All API routes (auth, tasks, Google Sheets, checklist, planner, voice)
- `server/engines/dispatcher.ts` — Audio-to-Engine dispatcher for voice command intent classification
- `server/engines/calendar-engine.ts` — Calendar dictation engine for schedule-related voice commands
- `server/engines/planner-engine.ts` — Planner engine (refactored from inline planner Q&A logic)
- `client/src/hooks/use-voice.tsx` — VoiceProvider context and global voice state management
- `client/src/components/voice-command-bar.tsx` — Global VoiceCommandBar UI component
- `client/src/pages/planner.tsx` — AI Planner page with daily briefing, weekly summary, Q&A
- `server/checklist-pdf.ts` — PDF checklist generator using pdfkit
- `server/ocr-processor.ts` — OCR image processor using Tesseract.js
- `client/src/pages/checklist.tsx` — Print Checklist & OCR scan page
- `server/db.ts` — PostgreSQL connection using `pg` driver with Drizzle ORM
- `client/src/lib/auth-context.tsx` — AuthProvider context with login/register/logout
- `client/src/pages/login.tsx` — Full login UI with register, forgot password, security question flows
- `shared/schema.ts` — Drizzle schema + Zod validation schemas

## External Dependencies

### Authentication
- **Passport.js**: Authentication middleware with local strategy
- **bcrypt**: Password hashing (cost factor 12)
- **express-session + connect-pg-simple**: PostgreSQL-backed sessions
- **express-rate-limit**: Rate limiting on auth endpoints
- **helmet**: Security headers

### Database
- **PostgreSQL**: Replit Helium database (local, `pg` driver)
- **Drizzle ORM**: Type-safe database operations and schema management

### Google Integration
- **Google Sheets API**: Task import/export sync (optional, requires OAuth credentials)
- **googleapis**: Official Google API client library

### UI Libraries
- **Radix UI**: Headless UI primitives
- **Lucide React**: Icon library
- **Recharts**: Data visualization
- **date-fns**: Date manipulation

### File Processing
- **Papa Parse**: CSV parsing and generation
- **xlsx**: Excel file processing
- **pdfkit**: PDF document generation (checklist)
- **multer**: Multipart file upload handling (OCR image upload)
- **Tesseract.js**: Client-side OCR engine for checklist scanning

### Development
- **Vite**: Frontend build tool
- **esbuild**: Backend bundling
- **TypeScript**: Type safety across the stack
- **Tailwind CSS**: Utility-first CSS
- **Vitest**: Unit testing
- **cross-env**: Cross-platform env vars

## Deployment
- **Target**: Replit Autoscale
- **Build**: `npm run build` (Vite frontend + esbuild backend)
- **Start**: `npm run start` (Node.js production server)
- **Database**: Replit Helium PostgreSQL (auto-provisioned)
- **Secrets**: SESSION_SECRET, AUTH_PROVIDER, REGISTRATION_MODE set via Replit Secrets
