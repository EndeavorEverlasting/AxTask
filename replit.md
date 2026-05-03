# AxTask — Priority Engine Task Management System

## Overview
AxTask is a full-stack intelligent task management application that automates task prioritization using an advanced scoring engine. It analyzes task content, keywords, tags, and other factors to assign priorities, reducing manual effort and enhancing task organization. The project aims to deliver a professional, secure, and highly functional task management solution with a clean user experience, with a vision to enhance productivity for individuals and teams, tapping into the growing demand for smart, efficient workflow tools.

## User Preferences
Preferred communication style: Simple, everyday language.
Do not make changes to the `.replit` file.
Do not make changes to the `vite.config.ts` file.
Do not make changes to the `server/vite.ts` file.
Do not make changes to the `drizzle.config.ts` file.
Do not make changes to the `package.json` scripts.
Do not reorgnise, remove, or rename any tier of the authentication system.
Do not change the deployment target, build command, start command, or port configuration.
Do not run `DROP TABLE`, `TRUNCATE`, or destructive `ALTER TABLE` without explicit written user confirmation.
Do not delete or reset `DATABASE_URL`. Always prefer additive migrations.
Do not change the `productionDomain` constant in `server/index.ts` without explicit user instruction as part of a separate task.

## System Architecture

### UI/UX Decisions
The application uses React 18 with TypeScript, `shadcn/ui` (Radix UI), and Tailwind CSS for a mobile-responsive design. It features dynamic focus glow, auto-focus, enhanced button labels, full keyboard navigation, and UI scale control. `framer-motion` handles animations, respecting `prefers-reduced-motion`.

### Technical Implementations
The frontend uses TanStack Query for state management, Wouter for routing, and React Hook Form with Zod for form handling. The backend is Node.js and Express.js (TypeScript, ES modules). PostgreSQL with Drizzle ORM is used for the database, and the API is RESTful with JSON. Both client and server-side validation use Zod schemas. Session management uses PostgreSQL-backed storage.

Key features include:
-   **Priority Engine**: Algorithm for task prioritization based on multiple factors.
-   **Calendar Views**: Interactive task rescheduling via drag-and-drop.
-   **Import/Export System**: Bulk Excel/CSV import and export with server-side processing.
-   **Print Checklist & OCR**: Generates printable PDF checklists and supports OCR for status updates.
-   **AI Planner Agent**: Provides daily briefings, task recommendations, mini-calendars, and a conversational Q&A.
-   **Analytics Dashboard**: Visual insights into task metrics.
-   **Real-time Updates**: Achieved through optimistic updates and cache invalidation.
-   **Voice Input & Universal Voice Command System**: Web Speech API for dictation and global commands.
-   **Immersive Mobile Voice Overlay**: Full-screen mobile voice experience with animations.
-   **Task Review Engine**: Voice/text-driven bulk task management with natural language parsing.
-   **Gamification (AxCoins)**: Currency and rewards system for task-related actions.
-   **Data Migration Toolkit**: Full database export/import with referential integrity.
-   **Task Recurrence**: Configurable recurrence schedules.
-   **Proactive Field Glow Warnings**: Visual cues for empty required fields.
-   **Universal Glow System**: CSS glow classes for UI feedback and tutorials.
-   **Interactive Tutorial**: Guided walkthrough using the universal glow system.
-   **Real-time Collaboration**: Google Drive-style collaborative task editing via WebSocket.
-   **Coin Economy (Spend & Scarcity)**: Consumable coin sinks like Streak Shields, Priority Boost, Task Bounties, and Coin Gifting.
-   **Pattern Learning Engine**: RAG-style intelligence learning from user task history.
-   **Task Attachments**: Image uploads (JPEG/PNG/GIF/WebP, 5MB, 3 max) with drag-drop, thumbnails, lightbox, and markdown editor.
-   **Interactive Feedback System**: Contextual micro-surveys and reactions integrated with AxCoin economy.
-   **NodeWeaver Integration (Scaffolded)**: Feedback classification pipeline for bugs, feature requests, praise, etc., with a classification dispute system.
-   **Community Forum**: Social feed with posts, comments, upvotes/downvotes, emoji reactions, pagination, and gamification integration.

### Authentication & Security
Supports Google OAuth, Replit OIDC, WorkOS AuthKit, and local email/password (bcrypt). Security features include account lockout, banning, robust password policies, input validation, security questions, hashed password reset tokens, Security Admin UI, rate limiting, audit logging, request size limits, httpOnly session cookies, and enforced HTTPS with HSTS and CSP. Passport.js handles authentication middleware. TOTP-based MFA is available for critical actions, with secrets encrypted at rest.

### System Design Choices
Designed for Replit Autoscale (Google Cloud Run), necessitating a stateless architecture. All persistent state resides in PostgreSQL. File uploads are streamed without persistent disk storage. Deployment involves `npm run build` to create `dist/index.js` (backend) and `dist/public/` (frontend). Autoscale constraints include a single exposed port, Cloud Run controlling `PORT`, no persistent server memory/filesystem, and fast startup times. API routes and health checks must register before static file serving. Canonical production endpoints are `https://axtask.app` and `https://axtask.dev`.

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
-   **framer-motion**: Animation library.

### MFA / TOTP
-   **otpauth**: TOTP code generation and verification.
-   **qrcode**: QR code generation for MFA setup.

### File Processing
-   **Papa Parse**: CSV processing.
-   **xlsx**: Excel file processing.
-   **pdfkit**: PDF generation.
-   **multer**: File uploads.
-   **sharp**: Image thumbnail generation.
-   **Tesseract.js**: OCR engine.

### Development Utilities
-   **Vite**: Frontend build tool.
-   **esbuild**: Backend bundling.
-   **TypeScript**: Language.
-   **Tailwind CSS**: Styling framework.