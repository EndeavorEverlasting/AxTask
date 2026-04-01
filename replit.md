# AxTask — Priority Engine Task Management System

## Overview
AxTask is a full-stack intelligent task management application that automates task prioritization using an advanced scoring engine. It analyzes task content, keywords, tags, and other factors to assign priorities, reducing manual effort and enhancing task organization. The project aims to deliver a professional, secure, and highly functional task management solution with a clean user experience.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The application leverages React 18 with TypeScript, `shadcn/ui` (built on Radix UI), and Tailwind CSS for a mobile-responsive design. It incorporates advanced accessibility features such as dynamic focus glow, auto-focus for quick entry, enhanced button labels, full keyboard navigation, and UI scale control. `framer-motion` is used for animations, respecting `prefers-reduced-motion`.

### Technical Implementations
The frontend utilizes TanStack Query for state management, Wouter for routing, and React Hook Form with Zod for form handling. The backend is built with Node.js and Express.js (TypeScript, ES modules). PostgreSQL with Drizzle ORM serves as the database, and the API is RESTful with JSON responses. Both client and server-side validation are enforced with Zod schemas. Session management is handled by PostgreSQL-backed storage.

Key features include:
-   **Priority Engine**: An algorithm that considers urgency, impact, effort, keywords, tags, deadlines, and crisis detection.
-   **Calendar Views**: Interactive task management with drag-and-drop rescheduling.
-   **Import/Export System**: Bulk Excel/CSV import and export with server-side batch processing.
-   **Print Checklist & OCR**: Generates printable PDF checklists and allows OCR scanning for automated status updates.
-   **AI Planner Agent**: Provides daily briefings, recommended tasks, weekly mini-calendars, and a conversational Q&A interface.
-   **Analytics Dashboard**: Offers visual insights into task metrics.
-   **Real-time Updates**: Achieved through optimistic updates and cache invalidation.
-   **Voice Input & Universal Voice Command System**: Browser-native Web Speech API for task dictation and global voice commands (Ctrl+M) for intent classification (task creation, planner query, etc.).
-   **Immersive Mobile Voice Overlay**: Full-screen mobile voice experience with animated waveforms and branded result cards.
-   **Task Review Engine**: Voice/text-driven bulk task management with natural language parsing.
-   **Gamification (AxCoins)**: A currency and rewards system for task classification, on-time bonuses, streaks, achievements, and a Rewards Shop.
-   **Data Migration Toolkit**: Full database export/import with referential integrity validation.
-   **Task Recurrence**: Configurable recurrence schedules including custom day/date patterns.
-   **Proactive Field Glow Warnings**: Visual cues for empty required fields.
-   **Universal Glow System**: CSS glow classes for various UI feedback and tutorial purposes.
-   **Interactive Tutorial**: A guided walkthrough utilizing the universal glow system.
-   **Real-time Collaboration**: Google Drive-style collaborative task editing via WebSocket with live presence and role-based permissions.
-   **Coin Economy (Spend & Scarcity)**: Consumable coin sinks like Streak Shields, Priority Boost, Task Bounties, and Coin Gifting.
-   **Pattern Learning Engine**: RAG-style intelligence that learns from user task history to suggest topics, recurring tasks, and deadlines.

### Authentication & Security
The system supports Google OAuth, Replit OIDC, WorkOS AuthKit (enterprise SSO), and a local email/password strategy using bcrypt. Security features include account lockout, user banning, robust password policies, input validation, security questions, hashed password reset tokens, a Security Admin UI, rate limiting, comprehensive security audit logging, request size limits, session security with httpOnly cookies, and enforced HTTPS with HSTS and CSP in production. Authentication middleware is handled by Passport.js.

### System Design Choices
The application is designed for **Replit Autoscale** (Google Cloud Run), necessitating a stateless architecture. All persistent state (tasks, users, sessions, patterns, coins, collaboration data) resides in PostgreSQL, preventing reliance on in-memory state. File uploads and generated files are processed or streamed immediately without persistent disk storage. The deployment process involves `npm run build` to create `dist/index.js` (backend) and `dist/public/` (frontend), which are then containerized. Critical Autoscale constraints include a single exposed port, Cloud Run controlling the `PORT` environment variable, no persistent server memory or filesystem, and fast startup times. API routes and health checks must be registered before static file serving.

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

### File Processing
-   **Papa Parse**: CSV processing.
-   **xlsx**: Excel file processing.
-   **pdfkit**: PDF generation.
-   **multer**: File uploads.
-   **Tesseract.js**: OCR engine.

### Development Utilities
-   **Vite**: Frontend build tool.
-   **esbuild**: Backend bundling.
-   **TypeScript**: Language.
-   **Tailwind CSS**: Styling framework.