# Priority Engine Task Management System

## Overview

This is a full-stack task management application built with a React frontend and Express backend. The system features an intelligent priority scoring engine that automatically calculates task priorities based on content analysis, similar to the Google Sheets priority engine described in the attached assets. The application provides comprehensive task management capabilities including creation, editing, filtering, analytics, and data import/export functionality.

**Version:** 1.1.0 (Google Sheets Integration)  
**Last Updated:** July 30, 2025

## User Preferences

Preferred communication style: Simple, everyday language.
Cost monitoring: Required for server operations, especially import processes.
Processing time indicators: Help users decide whether to proceed with large imports or develop more compact versions.

## Recent Changes (v1.1.0)

### Google Sheets Integration (July 30, 2025)
- **Real-time API Integration**: Full Google Sheets API implementation with OAuth2 authentication
- **Comprehensive Documentation**: Added detailed setup guide (GOOGLE_SHEETS_SETUP.md) with multi-user security considerations
- **Hybrid Sync Approach**: Maintains CSV import/export as fallback while adding real-time API sync
- **Security-First Design**: API key protection, multi-user configurations, and credential rotation guidelines
- **Professional Setup Guide**: Step-by-step instructions for Google Cloud Console, API enablement, and OAuth setup

### Features Added
- **API Endpoints**: Complete Google Sheets REST API with authentication, import, export, and bidirectional sync
- **Client Library**: Type-safe Google API client with token management and error handling
- **UI Integration**: Enhanced Google Sheets sync page with authentication flow and real-time status
- **Documentation Suite**: Added GOOGLE_SHEETS_SETUP.md with security best practices and troubleshooting

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui component library
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for client-side routing
- **Build Tool**: Vite for development and build processes
- **Form Handling**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Database**: PostgreSQL with Drizzle ORM
- **Database Provider**: Neon Database (serverless PostgreSQL)
- **API Design**: RESTful API with JSON responses
- **Session Management**: PostgreSQL-based session storage

### Key Components

#### Priority Engine
- **Location**: `client/src/lib/priority-engine.ts`
- **Purpose**: Intelligent task classification and priority scoring
- **Features**:
  - Keyword-based scoring system
  - Tag detection (@urgent, #blocker, etc.)
  - Time sensitivity analysis
  - Date pattern recognition
  - Problem indicator detection
  - Repetition checking using Jaccard similarity
  - Priority scale: Highest (8+), High (6-7), Medium-High (4-5), Medium (2-3), Low (<2)

#### Database Schema
- **Location**: `shared/schema.ts`
- **Tables**: Single `tasks` table with comprehensive task metadata
- **Fields**: id, date, activity, notes, urgency, impact, effort, prerequisites, priority, priorityScore, classification, status, isRepeated, timestamps
- **Validation**: Zod schemas for insert and update operations

#### UI Components
- **Design System**: shadcn/ui components with custom styling
- **Key Components**: TaskForm, TaskList, PriorityBadge, ClassificationBadge
- **Layout**: Sidebar navigation with dashboard, tasks, analytics, and import/export pages
- **Theme**: Light/dark mode support with CSS variables

## Data Flow

1. **Task Creation**: User submits task via TaskForm → validated with Zod → sent to backend API
2. **Priority Calculation**: Backend calls PriorityEngine to calculate priority and classification
3. **Database Storage**: Task stored in PostgreSQL via Drizzle ORM
4. **Real-time Updates**: TanStack Query invalidates and refetches data
5. **UI Updates**: Components re-render with new data

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: Serverless PostgreSQL database connection
- **drizzle-orm**: Type-safe database ORM
- **@tanstack/react-query**: Server state management
- **@radix-ui/***: Headless UI components
- **react-hook-form**: Form handling and validation
- **zod**: Schema validation
- **tailwindcss**: Utility-first CSS framework

### Development Tools
- **vite**: Build tool and dev server
- **typescript**: Type checking
- **esbuild**: Server bundling
- **tsx**: TypeScript execution for development

## Deployment Strategy

### Development
- **Frontend**: Vite dev server with HMR
- **Backend**: tsx for TypeScript execution
- **Database**: Neon serverless PostgreSQL
- **Environment**: NODE_ENV=development

### Production
- **Build Process**: 
  - Frontend: `vite build` → static files in `dist/public`
  - Backend: `esbuild` → bundled server in `dist/index.js`
- **Server**: Express serves both API and static files
- **Database**: Drizzle migrations with `db:push` command
- **Environment**: NODE_ENV=production

### File Structure
```
├── client/          # React frontend
├── server/          # Express backend
├── shared/          # Shared types and schemas
├── migrations/      # Database migrations
└── dist/           # Built application
```

The application uses a monorepo structure with clear separation between client, server, and shared code, enabling efficient development and deployment workflows.