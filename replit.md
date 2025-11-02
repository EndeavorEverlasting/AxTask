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
- **Calendar Views**: Multiple time-based views (hourly, daily, weekly, monthly) for immersive task visualization and time blocking
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

## Current Development Phase

### Calendar View Implementation (Completed - November 2025)
The application now features comprehensive calendar views providing an immersive task management experience:

**Completed Calendar Features:**
1. **Multiple Time Scales** (✅ Implemented):
   - Hourly views with 1-hour, 2-hour, 4-hour, and 8-hour time blocks
   - Daily view with task grouping by priority
   - Weekly view with 7-day grid and weekly statistics
   - Monthly view with task density heatmap visualization

2. **Interactive Task Management** (✅ Implemented):
   - Click tasks to view full details in modal dialogs
   - Click "Edit" button to modify tasks directly from calendar views
   - Drag-and-drop tasks between time slots to reschedule (hourly views)
   - Visual priority indicators with color-coded borders
   - Real-time task updates with optimistic UI

3. **Aggregate Visualization** (✅ Implemented):
   - Task density heatmaps in monthly view with 5-level color coding
   - Priority distribution across all time periods
   - Completion status badges and statistics
   - Time allocation analytics with period-specific stats

4. **Immersive Interface** (✅ Implemented):
   - Modern, polished calendar design with gradient headers
   - Smooth transitions between all 7 calendar views
   - Hover effects and drag-and-drop visual feedback
   - Color-coded priority borders and classification badges
   - Dark mode support across all calendar components

**Time Field Implementation (November 2025):**
- Added `time` field to task schema (HH:MM format, 24-hour)
- Time picker in task form defaults to current time at submission
- Tasks automatically capture creation time
- Tasks display in correct hourly time slots (not midnight)
- Drag-and-drop updates task time and triggers re-render
- Future: Timezone support for international users

**Technical Implementation:**
- Calendar components built with React 18 and Tailwind CSS
- Date calculations using date-fns for performance and accuracy
- TanStack Query for data fetching and cache management
- Responsive design tested on mobile and desktop
- Drag-and-drop using HTML5 Drag and Drop API
- Optimistic updates for smooth UX during drag operations

**Integration Points:**
- Google Calendar API support (planned for future)
- Existing Google Sheets sync workflow
- Task form includes time picker with current time default
- Analytics dashboard ready for calendar-based insights
- All calendar views support click-to-edit workflow