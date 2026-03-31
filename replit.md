# AxTask — Priority Engine Task Management System

## Overview
AxTask is a full-stack intelligent task management application designed to automate task prioritization. It uses an advanced scoring engine that analyzes task content, keywords, tags, and other factors to assign priorities, thereby reducing manual effort and enhancing task organization. The project aims to provide a professional, secure, and highly functional task management solution with a clean user experience.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application uses React 18 with TypeScript, `shadcn/ui` (built on Radix UI), and Tailwind CSS for styling. It features a fully mobile-responsive design, adapting layout and components for smaller screens. Advanced accessibility features include a dynamic focus glow system, auto-focus for quick entry, improved button labels, full keyboard navigation, and UI scale control.

### Technical Implementations
The frontend utilizes TanStack Query for state management, Wouter for routing, and React Hook Form with Zod for form handling. The backend runs on Node.js with Express.js (TypeScript, ES modules). PostgreSQL with Drizzle ORM is used for the database, and the API is RESTful with JSON responses. Session management is handled by PostgreSQL-backed storage. Both client and server-side validation are enforced with Zod schemas.

Key features include:
-   **Priority Engine**: An intelligent algorithm factoring in urgency, impact, effort, keywords, tags, deadlines, and crisis detection.
-   **Calendar Views**: Interactive task management with drag-and-drop rescheduling across multiple time-based views.
-   **Import/Export System**: Bulk Excel/CSV import and export with server-side batch processing.
-   **Print Checklist & OCR**: Generates printable PDF checklists and allows OCR scanning of completed checklists for automated task status updates.
-   **AI Planner Agent**: An intelligent planning panel offering daily briefings, recommended tasks with priority reasoning, weekly mini-calendars, and a conversational Q&A interface.
-   **Analytics Dashboard**: Provides visual insights into task metrics.
-   **Real-time Updates**: Achieved through optimistic updates and cache invalidation.
-   **Task Search**: Full-text search with debounce.
-   **Performance Optimizations**: Includes `React.memo`, debouncing, SQL aggregate queries, bulk updates, and database indexing.
-   **Animations**: Uses `framer-motion` for various UI animations, respecting `prefers-reduced-motion`.
-   **Voice Input**: Browser-native Web Speech API for dictating task activity and notes, including voice commands for task attributes.
-   **Universal Voice Command System**: A global voice command bar (Ctrl+M) with server-side dispatching to classify intent (task creation, planner query, calendar command, navigation, search, task review) and process commands through dedicated engines.
-   **Immersive Mobile Voice Overlay**: Full-screen mobile voice experience with animated waveform bars, large mic button with ripple effects, intent-branded result cards, swipe-down-to-close gesture, auto-start listening, and full accessibility (dialog role, aria labels, focus management, reduced motion respect). Desktop retains the compact command bar.
-   **Task Review Engine**: Voice/text-driven bulk task management with natural language parsing to process user feedback on recommended tasks and generate structured proposals for approval.
-   **Gamification (AxCoins)**: A currency and rewards system with coin earning (priority-based amounts, on-time bonuses, streak multipliers), achievement badges, a Rewards Shop, and transaction history.
-   **Classification Rewards & Compound Interest**: Users earn AxCoins for classifying tasks, with additional coins earned for confirmations from other users and compound interest.
-   **Data Migration Toolkit**: Full database export/import with referential integrity validation, including an admin UI and user self-service options for GDPR data portability.
-   **Task Recurrence**: Tasks can be configured with various recurrence schedules (daily, weekly, monthly, etc.) plus custom day-of-week (`custom:days:mon,wed,fri`) and day-of-month (`custom:dates:1,15`) patterns via an interactive picker UI.
-   **Cleanup Bonus**: Users earn 4 AxCoins for meaningful updates to pending tasks older than 7 days (once per task). Stats shown on Rewards Profile tab.
-   **Proactive Field Glow Warnings**: Visual cues (yellow glow) for empty required fields in forms, clearing upon input.
-   **Universal Glow System**: Five CSS glow classes (`field-glow-hint`, `field-glow-warning`, `field-glow-success`, `field-glow-tutorial`, `field-glow-tutorial-success`) for various UI feedback and tutorial purposes.
-   **Interactive Tutorial**: A 14-step guided walkthrough covering key application features, utilizing the universal glow system.
-   **Real-time Collaboration**: Google Drive-style collaborative task editing via WebSocket, including task sharing with role-based permissions, live presence indicators, and real-time field edit broadcasting.
-   **Collaboration Rewards**: Users earn AxCoins for sharing tasks and completing collaborative tasks, including collaboration-specific badges.
-   **Coin Economy (Spend & Scarcity)**: Consumable coin sinks such as Streak Shields, Priority Boost, Task Bounties, and Coin Gifting to create ongoing demand for AxCoins.
-   **Pattern Learning Engine**: RAG-style intelligence that learns from user task history to detect topics, recurring tasks, deadline rhythms, and suggest deadlines.

### Authentication & Security
The system features multi-tier authentication supporting Google OAuth, Replit OIDC, WorkOS AuthKit (enterprise SSO), and a hardened local email/password strategy using bcrypt. Security measures include account lockout, user banning, robust password policies, input validation, security questions, hashed password reset tokens, a Security Admin UI, rate limiting, comprehensive security audit logging, request size limits, session security with httpOnly cookies, and enforced HTTPS with HSTS and CSP in production.

### Database Schema
Key tables include `users`, `password_reset_tokens`, `security_logs`, `tasks`, `task_collaborators`, `task_patterns`, `classification_contributions`, and `classification_confirmations`. Sessions are managed by `connect-pg-simple`.

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