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
- Drag-and-drop using HTML5 Drag and Drop API (hourly views only in v1.2.0)
- Optimistic updates for smooth UX during drag operations

**Drag-and-Drop Status (v1.2.0):**
- **Implemented**: Hourly views (1h, 2h, 4h, 8h) support drag-and-drop task rescheduling
- **Features**: GripVertical icon, visual feedback, drop zone highlighting, toast confirmation
- **Planned for v1.3.0**: Extend drag-and-drop to daily, weekly, and monthly views
- **Planned for v1.3.0**: Drag-to-delete feature (drag tasks to recycle bin)

**Integration Points:**
- Google Calendar API support (planned for future)
- Existing Google Sheets sync workflow
- Task form includes time picker with current time default
- Analytics dashboard ready for calendar-based insights
- All calendar views support click-to-edit workflow

### Accessibility & UX Improvements (Version 1.2.0 - November 2025)

**Dynamic Focus Glow System:**
The application implements an innovative accessibility feature using CSS `:has()` selectors to provide visual feedback for keyboard navigation:

- **Green Glow** (rgb(34, 197, 94)): Indicates Add Task or Update Task action will execute on Enter
- **Red Glow** (rgb(239, 68, 68)): Indicates Delete Task action will execute on Enter
- **Grey Glow** (rgb(156, 163, 175)): Indicates Cancel action will execute on Enter

Technical implementation uses CSS `:has()` pseudo-class:
```css
.task-form-card:has(.btn-submit:focus) {
  outline: 2px solid rgb(34, 197, 94);
  box-shadow: 0 10px 15px -3px rgba(34, 197, 94, 0.3);
}
```

This solves the 100% zoom accessibility problem where action buttons may be positioned outside the visible viewport. Users can:
1. Press Tab to navigate through form fields
2. Continue tabbing until the form glows (indicating button focus)
3. Press Enter to execute the action without needing to see or click the button

**Auto-Focus for Quick Entry:**
- The first input field (Date) automatically receives focus when the Quick Task Entry form loads
- Implemented using `autoFocus={!task}` prop on the date input
- Enables immediate keyboard input without clicking
- Matches the "Quick Task Entry" promise for rapid task creation

**Improved Button Labels:**
- Changed "Clear" to "Cancel" for clarity
- Cancel button now closes the form instead of clearing fields
- Delete button only appears when editing existing tasks (not for new tasks)
- Confirmation dialogs show task details before deletion

**Auto-Refresh Data Synchronization:**
TanStack Query configuration optimized to prevent data loss:
```typescript
{
  refetchInterval: 30000,          // Poll every 30 seconds
  refetchOnWindowFocus: true,       // Refresh when tab regains focus
  staleTime: 10000,                // Data fresh for 10 seconds
}
```

Real-world problem solved: Users spending time writing detailed notes would lose work if another process updated the database. The 30-second polling and window-focus refresh ensure data stays synchronized, preventing conflicts and data loss.

**Delete Functionality:**
- Hard delete with confirmation dialog (permanent deletion in v1.2.0)
- Soft delete with 30-day recycle bin system planned for v1.3.0
- Delete buttons have red glow when focused (form and All Tasks table)
- Confirmation dialog previews task before deletion
- Cache invalidation ensures UI updates immediately after deletion

**Keyboard Accessibility:**
- All forms fully navigable with Tab key
- Enter key submits forms when action buttons are focused
- Escape key closes dialogs
- Focus indicators clearly visible at all zoom levels
- No mouse required for any operation
- Grey glow indicates form is active (input/textarea/select focused, pressing Enter won't submit)

**Form Focus Behavior (v1.2.0):**
- **Input fields focused**: Form glows grey (indicates typing mode, Enter key won't submit)
- **Textarea focused**: Form glows grey (indicates typing mode, Enter key adds new line)
- **Dropdown focused**: Form glows grey (indicates selection mode, Enter confirms selection)
- **Submit button focused**: Form glows green (indicates Enter will add/update task)
- **Delete button focused**: Form glows red (indicates Enter will delete task)
- **Cancel button focused**: Form glows grey (indicates Enter will cancel/close)

## Roadmap

### Version 1.3.0 (Planned)
- **Soft Delete System**: Recycle bin with 30-day retention before permanent deletion
- **Drag-and-Drop Expansion**: Extend to daily, weekly, and monthly calendar views
- **Drag-to-Delete**: Visual recycle bin appears during drag operations
- **Google Authentication**: OAuth 2.0 login with multi-user support
- **Deployment Structure**: Production environment with CI/CD pipeline
- **See**: VERSION_1.3.0_PLAN.md for detailed implementation plan

### Version 2.0 (Future)
- **WebSocket Real-Time Sync**: Live updates across multiple users/devices
- **Audit Log**: Track all changes to tasks with user attribution
- **Advanced Analytics**: Custom reports and data visualizations
- **Mobile App**: Native iOS and Android applications
- **API Webhooks**: Integrate with external tools (Slack, Teams, etc.)