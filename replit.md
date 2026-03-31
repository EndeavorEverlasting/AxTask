# AxTask — Priority Engine Task Management System

## Overview

AxTask is a full-stack intelligent task management application designed to automate task prioritization. It uses an advanced scoring engine that analyzes task content, keywords, tags, and other factors to assign priorities, thereby reducing manual effort and enhancing task organization. The project aims to provide a clean, secure, and highly functional task management solution, avoiding browser security false positives and offering a professional user experience with clean URLs.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application uses React 18 with TypeScript, `shadcn/ui` built on Radix UI, and Tailwind CSS for styling. It features a responsive design with full mobile device compatibility, advanced accessibility features like a dynamic focus glow system, auto-focus for quick entry, improved button labels, full keyboard navigation, and UI scale control for zoom accessibility.

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
-   **Real-time Collaboration**: Google Drive-style collaborative task editing via WebSocket (`/ws/collab`). Features include task sharing with role-based permissions (owner/editor/viewer), live presence indicators showing who's editing which field (colored rings and user avatars), real-time field edit broadcasting, and a share dialog for inviting collaborators by email. Schema: `taskCollaborators` table. Server: `server/collaboration.ts`. Client: `client/src/hooks/use-collaboration.ts`, `client/src/components/share-dialog.tsx`.

### Authentication & Security
The system features multi-tier authentication supporting Google OAuth, Replit OIDC, WorkOS AuthKit (enterprise SSO), and a hardened local email/password strategy using bcrypt. Registration can be open, invite-only, or closed. Security measures include account lockout, admin-controlled user banning, robust password policies, input validation, optional security questions, SHA-256 hashed password reset tokens, and a dedicated Security Admin UI. Rate limiting is applied to various endpoints, and comprehensive security audit logging tracks critical events. Request size limits are enforced, session security uses httpOnly cookies and secure flags, and production environments enforce HTTPS with HSTS and strict Content Security Policies. `Helmet.js` provides additional security headers.

### Database Schema
Key tables include `users` (id, email, passwordHash, role, authProvider details, security info, ban status), `password_reset_tokens` (id, userId, tokenHash, expiry), `security_logs` (id, eventType, userId, targetUserId, ipAddress, details), `tasks` (id, userId, date, time, activity, notes, urgency, impact, effort, priority, status, sortOrder, etc.), and `task_collaborators` (id, taskId, userId, role, invitedBy, invitedAt). Sessions are managed by `connect-pg-simple`.

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
-   **Vitest**: Testing framework.
-   **cross-env**: Cross-platform environment variables.