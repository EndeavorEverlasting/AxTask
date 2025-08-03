# Priority Engine Task Management System

## Overview

A full-stack intelligent task management application that automatically calculates task priorities using an advanced scoring engine. The system analyzes task content, keywords, tags, and other factors to assign priorities automatically, reducing manual effort and improving task organization. Originally designed to upgrade a Google Sheets-based workflow, this system provides a modern web interface with real-time synchronization capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript for type safety and modern development patterns
- **UI Components**: shadcn/ui component library built on Radix UI primitives with Tailwind CSS for styling
- **State Management**: TanStack Query (React Query) for server state management, caching, and data synchronization
- **Routing**: Wouter for lightweight client-side routing without the overhead of React Router
- **Form Handling**: React Hook Form with Zod schema validation for type-safe form management
- **Build System**: Vite for fast development server and optimized production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js framework using TypeScript and ES modules
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations and schema management
- **API Design**: RESTful API with JSON responses and comprehensive CRUD operations
- **Session Management**: PostgreSQL-backed session storage using connect-pg-simple for persistence
- **Validation**: Zod schemas for request/response validation on both client and server sides

### Core Features & Design Patterns
- **Priority Engine**: Intelligent scoring algorithm that calculates task priorities based on urgency, impact, effort, keyword analysis, tag detection, and deadline proximity
- **Import/Export System**: CSV and Excel file processing with cost estimation and progress tracking for large datasets
- **Analytics Dashboard**: Visual insights and task metrics with completion rates and priority distributions
- **Mobile Responsive**: Full mobile device compatibility with responsive design patterns
- **Real-time Updates**: Optimistic updates and cache invalidation for smooth user experience

### Data Architecture
- **Database Schema**: Tasks table with comprehensive fields including priority scores, classifications, and timestamps
- **Priority Calculation**: Server-side processing with keyword classification, tag detection, time sensitivity analysis, and duplicate checking using Jaccard similarity
- **Cost Monitoring**: Real-time processing cost estimation and time tracking for import operations

### Authentication & Security
- **Input Validation**: Double validation pattern (client + server) using Zod schemas
- **SQL Injection Prevention**: Parameterized queries through Drizzle ORM
- **Rate Limiting**: API rate limiting for authentication attempts and external service calls
- **Session Security**: PostgreSQL-backed session storage with automatic cleanup

## External Dependencies

### Database Services
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling and automatic scaling
- **Drizzle ORM**: Type-safe database operations with schema management and migrations

### Google Integration
- **Google Sheets API**: Real-time synchronization with Google Sheets for task import/export
- **Google OAuth2**: User authentication for Google Sheets API access with proper scope limitations
- **googleapis**: Official Google API client library for Node.js integration

### Development Tools
- **Vite**: Frontend build tool with fast HMR and optimized production builds
- **esbuild**: Backend bundling for production deployment
- **TypeScript**: Type safety across the entire application stack
- **Tailwind CSS**: Utility-first CSS framework for consistent styling

### File Processing
- **Papa Parse**: CSV parsing and generation with error handling and validation
- **xlsx**: Excel file processing for import/export functionality

### UI Libraries
- **Radix UI**: Headless UI primitives for accessible component development
- **Lucide React**: Icon library with consistent styling
- **date-fns**: Date manipulation and formatting utilities