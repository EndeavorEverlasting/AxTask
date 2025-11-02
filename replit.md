# Priority Engine Task Management System

## Overview

A full-stack intelligent task management application that automatically calculates task priorities using an advanced scoring engine. The system analyzes task content, keywords, tags, and other factors to assign priorities automatically, reducing manual effort and improving task organization. The project's vision is to provide a modern web interface with real-time synchronization capabilities, upgrading traditional manual workflows.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
- **Framework**: React 18 with TypeScript
- **UI Components**: shadcn/ui built on Radix UI with Tailwind CSS for styling
- **Responsive Design**: Full mobile device compatibility
- **Accessibility**: Dynamic focus glow system using CSS `:has()`, auto-focus for quick entry, improved button labels, and full keyboard navigation.

### Technical Implementations
- **Frontend State Management**: TanStack Query for server state management, caching, and data synchronization.
- **Routing**: Wouter for lightweight client-side routing.
- **Form Handling**: React Hook Form with Zod schema validation.
- **Build System**: Vite for frontend, esbuild for backend.
- **Backend Runtime**: Node.js with Express.js (TypeScript, ES modules).
- **Database**: PostgreSQL with Drizzle ORM.
- **API Design**: RESTful API with JSON responses and CRUD operations.
- **Session Management**: PostgreSQL-backed session storage using connect-pg-simple.
- **Validation**: Zod schemas for client and server-side request/response validation.

### Feature Specifications
- **Priority Engine**: Intelligent scoring algorithm based on urgency, impact, effort, keywords, tags, and deadline.
- **Calendar Views**: Multiple time-based views (hourly, daily, weekly, monthly) with interactive task management, drag-and-drop rescheduling, and aggregate visualizations.
- **Import/Export System**: CSV and Excel file processing with cost estimation.
- **Analytics Dashboard**: Visual insights into task metrics, completion rates, and priority distributions.
- **Real-time Updates**: Optimistic updates and cache invalidation.
- **Autocomplete**: Intelligent autocomplete for task activities based on previous entries.
- **Delete Functionality**: Hard delete with confirmation dialogs, with plans for soft delete/recycle bin.

### System Design Choices
- **Data Architecture**: Tasks table includes priority scores, classifications, and timestamps. Priority calculation involves server-side processing for keyword, tag, time sensitivity, and duplicate checking.
- **Authentication & Security**: Double validation (client + server) using Zod, parameterized queries via Drizzle ORM, API rate limiting, PostgreSQL-backed session security, and Replit Secrets for sensitive data management (AES-256 encryption at rest, TLS in transit). Planned integration with Replit Auth for multi-provider OAuth.

## External Dependencies

### Database Services
- **Neon Database**: Serverless PostgreSQL hosting.
- **Drizzle ORM**: Type-safe database operations and schema management.

### Google Integration
- **Google Sheets API**: Real-time synchronization for task import/export.
- **Google OAuth2**: User authentication for API access.
- **googleapis**: Official Google API client library for Node.js.

### Development Tools
- **Vite**: Frontend build tool.
- **esbuild**: Backend bundling.
- **TypeScript**: Type safety across the stack.
- **Tailwind CSS**: Utility-first CSS framework.

### File Processing
- **Papa Parse**: CSV parsing and generation.
- **xlsx**: Excel file processing.

### UI Libraries
- **Radix UI**: Headless UI primitives.
- **Lucide React**: Icon library.
- **date-fns**: Date manipulation and formatting.