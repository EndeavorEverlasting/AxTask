# AxTask - Intelligent Task Management System

## Overview

AxTask is a full-stack intelligent task management application built with React and Express that features an automated priority scoring engine. The system automatically calculates task priorities based on content analysis, keyword detection, and context understanding. Originally designed to upgrade Google Sheets-based workflows, AxTask provides a modern web interface with database persistence, real-time analytics, and seamless import/export capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript for type safety and modern development
- **UI Components**: shadcn/ui component library built on Radix UI primitives with Tailwind CSS styling
- **State Management**: TanStack Query (React Query) for server state management and caching
- **Routing**: Wouter for lightweight client-side routing (**⚠️ `useLocation()` returns pathname only — never query strings; use custom window events for cross-component signals, not URL params; see `docs/DEBUGGING_REFERENCE.md`**)
- **Keyboard Shortcuts**: Canonical definitions in `client/src/lib/keyboard-shortcuts.ts`; handlers in `App.tsx`; tests in `keyboard-shortcuts.test.ts`
- **Form Handling**: React Hook Form with Zod schema validation
- **Build System**: Vite for fast development and optimized production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js framework using TypeScript
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **API Design**: RESTful API with JSON responses and comprehensive CRUD operations
- **Session Management**: PostgreSQL-backed session storage using connect-pg-simple
- **Validation**: Zod schemas for request/response validation on both client and server

### Core Features
- **Priority Engine**: Intelligent scoring algorithm that calculates task priorities based on urgency, impact, effort, keyword analysis, tag detection, and deadline proximity
- **Import/Export System**: CSV and Excel file processing with cost estimation and progress tracking
- **Google Sheets Integration**: Real-time API synchronization with OAuth2 authentication
- **Analytics Dashboard**: Visual insights and task metrics with completion rates and priority distributions
- **Mobile Responsive**: Full mobile device compatibility with responsive design patterns

### Data Architecture
- **Database Schema**: Tasks table with comprehensive fields including priority scores, classifications, and timestamps
- **Priority Calculation**: Server-side processing with keyword classification, tag detection, time sensitivity analysis, and duplicate checking using Jaccard similarity
- **Cost Monitoring**: Real-time processing cost estimation and time tracking for import operations

### Authentication & Security
- **Google OAuth2**: User authentication for Google Sheets API access
- **Rate Limiting**: API rate limiting for Google Sheets requests and authentication attempts
- **Input Validation**: Double validation pattern (client + server) using Zod schemas
- **SQL Injection Prevention**: Parameterized queries through Drizzle ORM

## External Dependencies

### Database Services
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **Drizzle ORM**: Type-safe database operations with schema management

### Google Services
- **Google Sheets API**: Real-time spreadsheet synchronization and data exchange
- **Google OAuth2**: User authentication and authorization for API access
- **Google Cloud Console**: API key management and project configuration

### UI and Styling
- **shadcn/ui**: Modern React component library built on Radix UI
- **Tailwind CSS**: Utility-first CSS framework for responsive design
- **Radix UI**: Accessible component primitives for complex UI interactions

### Development Tools
- **Vite**: Fast build tool and development server
- **esbuild**: JavaScript bundler for production builds
- **TypeScript**: Static type checking across the entire application stack

### File Processing
- **Papa Parse**: CSV parsing and generation for import/export functionality
- **Excel processing**: Support for .xlsx file formats with automatic conversion

### State Management
- **TanStack Query**: Server state management with caching, synchronization, and background updates