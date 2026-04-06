# AxTask — Priority Engine Task Management System

## Overview

AxTask is a full-stack intelligent task management application designed to automate task prioritization. It uses an advanced scoring engine that analyzes task content, keywords, tags, and other factors to assign priorities, thereby reducing manual effort and enhancing task organization. The project aims to provide a clean, secure, and highly functional task management solution, avoiding browser security false positives and offering a professional user experience with clean URLs.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application uses React 18 with TypeScript, `shadcn/ui` built on Radix UI, and Tailwind CSS for styling. It features a fully mobile-responsive design: on mobile (<768px) the sidebar becomes a Sheet drawer triggered by a hamburger top bar, a fixed bottom navigation bar provides quick access to Dashboard/Tasks/Calendar/Planner, task lists render as touch-friendly cards instead of tables, a floating voice FAB sits above the bottom nav, zoom scaling is disabled, all pages use reduced padding and smaller typography, and the edit dialog is nearly full-width. Desktop layout is unchanged. Advanced accessibility features include a dynamic focus glow system, auto-focus for quick entry, improved button labels, full keyboard navigation, and UI scale control for zoom accessibility.

### Technical Implementations
The frontend utilizes TanStack Query for state management, Wouter for routing, and React Hook Form with Zod for form handling. The build system employs Vite for the frontend and esbuild for the backend. The backend runs on Node.js with Express.js (TypeScript, ES modules). PostgreSQL with Drizzle ORM is used for the database, and the API is RESTful with JSON responses. Session management is handled by PostgreSQL-backed storage using `connect-pg-simple`. Both client and server-side validation are enforced with Zod schemas.

Key features include:
-   **Priority Engine**: An intelligent algorithm factoring in urgency, impact, effort, keywords, tags, deadlines, and crisis detection.
-   **Calendar Views**: Interactive task management with drag-and-drop rescheduling across multiple time-based views.
-   **Import/Export System**: Bulk Excel/CSV import and export with server-side batch processing.
-   **Print Checklist & OCR**: Generates printable PDF checklists and allows OCR scanning of completed checklists for automated task status updates.
-   **AI Planner Agent**: An intelligent planning panel offering daily briefings, recommended tasks with priority reasoning, weekly mini-calendars, and a conversational Q&A interface.
-   **Analytics Dashboard**: Provides visual insights into task metrics.
-   **Real-time Updates**: Achieved through optimistic updates and cache invalidation.
-   **Task Reordering**: Persistent drag-and-drop task reordering.
-   **Task Search**: Full-text search with debounce.
-   **Performance Optimizations**: Includes `React.memo`, debouncing, SQL aggregate queries, bulk updates, and database indexing.
-   **Animations**: Uses `framer-motion` for various UI animations, respecting `prefers-reduced-motion`.
-   **Voice Input**: Browser-native Web Speech API for dictating task activity and notes, including voice commands for task attributes.
-   **Universal Voice Command System**: A global voice command bar (Ctrl+M) with a sophisticated server-side dispatching system that classifies intent (task creation, planner query, calendar command, navigation, search, task review) and processes commands through dedicated engines (Calendar Engine, Planner Engine, Review Engine).
-   **Task Review Engine**: Voice/text-driven bulk task management. Users tell the AI which recommended tasks they've completed, need rescheduling, or priority changes. Natural language parsing with fuzzy matching against task names. Produces structured proposals shown in a Bulk Action Approval Dialog before committing. Engine: `server/engines/review-engine.ts`. UI: Quick Review card in `client/src/pages/planner.tsx`, approval dialog in `client/src/components/bulk-action-dialog.tsx`. Routes: `POST /api/tasks/review`, `POST /api/tasks/review/apply`.
-   **Gamification (AxCoins)**: A currency and rewards system with coin earning (priority-based amounts + on-time bonuses + streak multipliers), achievement badges (completion/streak milestones), a Rewards Shop (themes/badges/titles), animated sidebar coin balance display, and transaction history. Schema tables: wallets, coinTransactions, userBadges, rewardsCatalog, userRewards. Engine: `server/coin-engine.ts`. UI: `client/src/pages/rewards.tsx`.
-   **Classification Rewards & Compound Interest**: Users earn AxCoins (5-15 based on category) when classifying tasks. Other users can confirm a classification, earning 3 coins themselves. Each confirmation triggers compound interest (8% per confirmation) paid back to the original classifier using the formula `base × (1.08)^n`. Schema tables: `classification_contributions`, `classification_confirmations`. Engine: `server/classification-engine.ts`. Storage: `server/storage.ts` (classification contribution CRUD). Routes: `GET /api/tasks/:id/classifications`, `POST /api/tasks/:id/confirm-classification`, `POST /api/tasks/:id/reclassify`, `GET /api/gamification/classification-stats`. UI: `client/src/components/classification-confirm.tsx` (lazy-loaded thumbs-up widget on task cards), `client/src/components/classification-badge.tsx` (interactive badge with dropdown for manual reclassification — users tap the badge to pick a category and earn coins), "Investments" tab in `client/src/pages/rewards.tsx` with stats dashboard.
-   **Data Migration Toolkit**: Full database export/import with referential integrity validation. Admin UI under Security Admin > Data Migration tab for full-database or per-user exports, file upload import with dry-run validation (DB-aware conflict checking), import mode selector (preserve IDs or remap with new UUIDs), and detailed result reports. User self-service export (`GET /api/account/export`) and import (`POST /api/account/import`) for GDPR data portability — self-service import is scoped to user-owned tables only (tasks, wallets, badges, etc.) and excludes global/admin tables (users, rewardsCatalog, securityLogs). CLI script at `scripts/migrate.ts` with `--mode preserve|remap` flag. Export format is database-agnostic JSON with metadata header, chunked pagination (1000 rows), and FK-ordered table data. Import engine validates all FK references, supports preserve (skip existing) and remap (generate new UUIDs, rewrite FKs) modes. Engine: `server/migration/export.ts`, `server/migration/import.ts`. Routes: `POST /api/admin/export`, `GET /api/admin/export/:userId`, `POST /api/admin/import`, `POST /api/admin/import/validate`, `GET /api/account/export`, `POST /api/account/import`.
-   **Task Recurrence**: Tasks can have a recurrence schedule (none, daily, weekly, biweekly, monthly, quarterly, yearly). Schema field: `tasks.recurrence` (text, default "none"). Displayed as a violet badge with repeat icon on both desktop table rows and mobile cards. Recurrence selector is in the task form between Effort and Prerequisites.
-   **Proactive Field Glow Warnings**: When creating a new task, empty required fields (Activity, Time, Notes) automatically glow yellow using the `field-glow-warning` CSS animation. The glow clears when the field gets a value. On submit, any still-empty fields re-glow with a toast notification.
-   **Universal Glow System**: Five CSS glow classes available for any element: `field-glow-hint` (blue — focus guidance), `field-glow-warning` (yellow — missing fields), `field-glow-success` (green — completed actions), `field-glow-tutorial` (yellow — tutorial targeting), `field-glow-tutorial-success` (green — tutorial action targets). All support dark mode and `prefers-reduced-motion`.
-   **Interactive Tutorial**: A 14-step guided walkthrough (**Ctrl+Shift+Y** / **Cmd+Shift+Y** to toggle — avoids browser tab shortcuts) covering Dashboard, AI Planner, Task Form, Voice Commands, Classification & Compound Interest, Calendar, Analytics, Rewards Shop, Print Checklist, Import/Export, Google Sheets, and Keyboard Shortcuts. Uses yellow/green glows on sidebar links with an overlay tooltip. Engine: `client/src/hooks/use-tutorial.tsx`. UI: `client/src/components/tutorial-overlay.tsx`.
-   **Real-time Collaboration**: Google Drive-style collaborative task editing via WebSocket (`/ws/collab`). Features include task sharing with role-based permissions (owner/editor/viewer), live presence indicators showing who's editing which field (colored rings and user avatars), real-time field edit broadcasting, and a share dialog for inviting collaborators by email. Schema: `taskCollaborators` table. Server: `server/collaboration.ts`. Client: `client/src/hooks/use-collaboration.ts`, `client/src/components/share-dialog.tsx`.

### Authentication & Security
The system features multi-tier authentication supporting Google OAuth, Replit OIDC, WorkOS AuthKit (enterprise SSO), and a hardened local email/password strategy using bcrypt. Registration can be open, invite-only, or closed. Security measures include account lockout, admin-controlled user banning, robust password policies, input validation, optional security questions, SHA-256 hashed password reset tokens, and a dedicated Security Admin UI. Rate limiting is applied to various endpoints, and comprehensive security audit logging tracks critical events. Request size limits are enforced, session security uses httpOnly cookies and secure flags, and production environments enforce HTTPS with HSTS and strict Content Security Policies. `Helmet.js` provides additional security headers.

### Database Schema
Key tables include `users` (id, email, passwordHash, role, authProvider details, security info, ban status), `password_reset_tokens` (id, userId, tokenHash, expiry), `security_logs` (id, eventType, userId, targetUserId, ipAddress, details), `tasks` (id, userId, date, time, activity, notes, urgency, impact, effort, priority, status, sortOrder, etc.), `task_collaborators` (id, taskId, userId, role, invitedBy, invitedAt), `task_patterns` (id, userId, patternType, patternKey, data JSON, confidence, occurrences, lastSeen — unique on userId+patternType+patternKey), `classification_contributions` (id, taskId, userId, classification, baseCoinsAwarded, totalCoinsEarned, confirmationCount — unique on taskId+userId), and `classification_confirmations` (id, contributionId, taskId, userId, coinsAwarded — unique on taskId+userId). Sessions are managed by `connect-pg-simple`.

-   **Pattern Learning Engine**: RAG-style pattern intelligence that learns from user task history. Detects topics, recurring tasks, deadline rhythms, and similarity clusters. Suggests deadlines based on learned cadence (daily/weekly/biweekly/monthly). Engine: `server/engines/pattern-engine.ts`. Storage: `task_patterns` table with atomic upsert. UI: "Patterns & Insights" card in `client/src/pages/planner.tsx`, deadline suggestion banner in `client/src/components/task-form.tsx`. Routes: `GET /api/patterns/insights`, `POST /api/patterns/learn`, `POST /api/patterns/suggest-deadline`. Learns incrementally on each task creation via `learnFromTask()` and supports full re-analysis via Analyze button. Caps analysis at 500 most recent tasks for performance.

## External Dependencies

### Authentication
-   **Passport.js**: Authentication middleware.
-   **bcrypt**: Password hashing.
-   **express-session**, **connect-pg-simple**: PostgreSQL-backed sessions.
-   **express-rate-limit**: Rate limiting.
-   **helmet**: Security headers.

### Database
-   **PostgreSQL**: Replit Helium database.
-   **Drizzle ORM**: Type-safe ORM.

### Google Integration
-   **Google Sheets API**: For task import/export.
-   **googleapis**: Google API client.

### UI Libraries
-   **Radix UI**: Headless UI components.
-   **Lucide React**: Icons.
-   **Recharts**: Data visualization.
-   **date-fns**: Date manipulation.

### File Processing
-   **Papa Parse**: CSV processing.
-   **xlsx**: Excel file processing.
-   **pdfkit**: PDF generation.
-   **multer**: File uploads.
-   **Tesseract.js**: OCR engine.

### Development
-   **Vite**: Frontend build tool.
-   **esbuild**: Backend bundling.
-   **TypeScript**: Language.
-   **Tailwind CSS**: Styling framework.
-   **Vitest**: Testing framework (`npm run test`). Includes **`server/local-setup-tutorial.test.ts`**, which fails if onboarding docs or `package.json` drop cross-platform env bootstrap (`local:env-init`, `docker:env-init`) or the Windows **`cp` / cmd** guidance — so Replit CI and local runs catch tutorial drift before users do.
-   **cross-env**: Cross-platform environment variables.

## Replit automation and database safety

- **`[postMerge]`** runs [`scripts/post-merge.sh`](scripts/post-merge.sh): `npm install`, then **`npm run db:push` only if** `AXTASK_POST_MERGE_DB_PUSH=1` is set in the environment (e.g. Replit Secrets). If unset, schema sync is skipped and a line is logged. This avoids Drizzle `push` running against production after an unintended merge.
- To restore the old behavior on a **dev-only** Repl, set `AXTASK_POST_MERGE_DB_PUSH=1` in Secrets.
- Prefer **GitHub branch protection** on `main` so automated or agent pushes require a PR; keep production `DATABASE_URL` off experimental Repls. See **Replit and GitHub safety** in [`README.md`](README.md) and [`AGENTS.md`](AGENTS.md).