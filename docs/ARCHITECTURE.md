# AxTask System Architecture Documentation

## Overview

AxTask is built using modern web development practices with a focus on type safety, performance, and maintainability. This document provides technical details for developers maintaining and extending the intelligent task management system.

## Monorepo Guardrails

- AxTask should be treated as a monorepo-style codebase for delivery workflows.
- NodeWeaver is hybrid: internal at `services/nodeweaver/upstream` when vendored (plain source, not a submodule), or external service mode when deployment profile requires it. See [`docs/NODEWEAVER.md`](NODEWEAVER.md).
- Classification ownership is shared: NodeWeaver provides engine primitives while AxTask owns fallback/orchestration policy.
- The legacy submodule path `NodeWeaver._pre_submodule_backup` is not an active architecture component and is not tracked in git.
- Avoid reintroducing git-submodule workflows for NodeWeaver unless a dedicated architecture decision says otherwise.

## NodeWeaver engines and classifier contracts

Treat classifier outputs (source, fallback layer, confidence) as the foundation for higher-level engines, agents, and product features. The short-term active boundary is: universal classifier plus feedback engine plus AxTask fallback orchestration. Mid-term work should extend those contract points rather than adding parallel, unsynchronized classification paths.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Browser (Client)                            │
├─────────────────────────────────────────────────────────────────┤
│  React App (TypeScript)                                        │
│  ├── Components (shadcn/ui + custom)                           │
│  ├── Pages (wouter routing)                                    │
│  ├── State Management (TanStack Query)                         │
│  └── Business Logic (Priority Engine client-side)             │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   │ HTTPS/JSON API
                                   │
┌─────────────────────────────────────────────────────────────────┐
│                   Express Server (Node.js)                     │
├─────────────────────────────────────────────────────────────────┤
│  API Layer                                                     │
│  ├── RESTful Routes (/api/tasks/*)                            │
│  ├── Request Validation (Zod schemas)                         │
│  ├── Priority Engine (server-side processing)                 │
│  └── Error Handling & Logging                                 │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   │ SQL Queries
                                   │
┌─────────────────────────────────────────────────────────────────┐
│                 PostgreSQL Database                            │
├─────────────────────────────────────────────────────────────────┤
│  Data Layer                                                    │
│  ├── Tasks Table (primary data)                               │
│  ├── Session Store (user sessions)                            │
│  ├── Indexes (performance optimization)                       │
│  └── Connection Pool (managed by Drizzle)                     │
└─────────────────────────────────────────────────────────────────┘
```

## Frontend Architecture

### Component Hierarchy

```
App (Root)
├── ThemeProvider (dark/light mode)
├── QueryClient Provider (React Query)
├── Router (wouter)
│   ├── Dashboard Page
│   │   ├── TaskForm Component
│   │   └── TaskList Component (truncated)
│   ├── Tasks Page
│   │   └── TaskList Component (full view)
│   ├── Analytics Page
│   │   └── Chart Components
│   └── Import/Export Page
│       ├── FileUpload Component
│       ├── ProgressIndicator Component
│       └── CostMonitoring Component
```

### State Management Strategy

- **Server State**: TanStack Query handles all API data
  - Automatic caching with intelligent invalidation
  - Background refetching for data freshness
  - Optimistic updates for better UX
  - Query keys use array format for hierarchical invalidation

- **Client State**: React useState for UI-specific state
  - Form state managed by react-hook-form
  - Modal open/close states
  - Filter and search parameters
  - Import progress tracking

- **Global State**: Context providers for:
  - Theme preference (light/dark)
  - Toast notifications
  - Query client configuration

### Routing & Cross-Component Communication

- **Router**: Wouter (lightweight, pathname-only)
  - ⚠️ `useLocation()` returns **only the pathname** — never query strings
  - ⚠️ `setLocation("/path?q=1")` is a **no-op** when already on `/path`
  - Use `useSearch()` if you must read query params (rare — prefer events)

- **Cross-Component Signals**: Custom `window` events (not URL query params)
  - Hotkeys and sidebar buttons dispatch named events (e.g. `axtask-open-new-task`)
  - Target components listen via `useEffect` + `addEventListener`
  - Use `setTimeout(..., 50)` when dispatching after `setLocation` to allow mount
  - Full event contract table: see `docs/DEBUGGING_REFERENCE.md`

- **Keyboard Shortcuts**: Canonical source is `client/src/lib/keyboard-shortcuts.ts` (`KBD` object)
  - Global handlers registered in `App.tsx`
  - Sidebar buttons must fire identical events to the hotkeys
  - Unit tests in `keyboard-shortcuts.test.ts` enforce mappings, collision-freedom, and event contracts

### Data Flow Patterns

1. **User Action** → Component event handler
2. **Form Validation** → Zod schema validation (client-side)
3. **API Request** → TanStack Query mutation
4. **Server Processing** → Priority calculation + database storage
5. **Response Handling** → Cache invalidation + UI updates
6. **Error Handling** → Toast notifications + form error display

## Backend Architecture

### API Design Principles

- **RESTful Design**: Standard HTTP methods with semantic URLs
- **Input Validation**: Double validation (client + server) using Zod
- **Error Handling**: Consistent error response format
- **Type Safety**: TypeScript throughout with shared schemas
- **Performance**: Efficient database queries with proper indexing

### Request/Response Flow

```
HTTP Request
    ↓
Express Middleware Stack
    ├── CORS handling
    ├── JSON body parsing
    ├── Session management
    └── Request logging
    ↓
Route Handler
    ├── Input validation (Zod)
    ├── Business logic processing
    ├── Database operations (Drizzle)
    └── Response formatting
    ↓
HTTP Response (JSON)
```

### Database Layer

**ORM Strategy**: Drizzle ORM chosen for:
- Type safety with automatic TypeScript generation
- Performance comparable to raw SQL
- Schema-first development approach
- Minimal runtime overhead

**Connection Management**:
- Connection pooling via @neondatabase/serverless
- WebSocket connections for serverless compatibility
- Automatic connection cleanup and error recovery

## Priority Engine Algorithm

### Core Logic Flow

```
Task Input (activity, notes, urgency, impact, effort)
    ↓
Text Analysis Pipeline
    ├── Keyword Detection (weighted scoring)
    ├── Tag Pattern Matching (@urgent, #blocker, etc.)
    ├── Time Sensitivity Analysis (deadline detection)
    ├── Problem Indicator Detection (bug, error, issue)
    └── Content Classification (development, meeting, admin, etc.)
    ↓
Priority Calculation
    ├── Base Score = (Urgency × Impact) / Effort
    ├── Keyword Bonuses (+0.5 to +3.0 points)
    ├── Tag Multipliers (1.2x to 2.0x)
    ├── Time Urgency Bonus (up to +2.0 points)
    └── Problem Severity Bonus (up to +1.5 points)
    ↓
Similarity Check (prevent duplicates)
    ├── Jaccard Index calculation
    ├── Token-based comparison
    └── Duplicate flagging (threshold: 0.7)
    ↓
Final Priority Assignment
    ├── Score → Priority Level mapping
    ├── Classification assignment
    └── Database storage
```

### Scoring Thresholds

```javascript
const PRIORITY_THRESHOLDS = {
  HIGHEST: 8.0,  // Critical, urgent tasks
  HIGH: 6.0,     // Important tasks
  MEDIUM_HIGH: 4.0, // Moderate priority
  MEDIUM: 2.0,   // Standard tasks
  LOW: 0.0       // Nice-to-have
};
```

## Database Schema Design

### Tasks Table Structure

```sql
CREATE TABLE tasks (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  activity TEXT NOT NULL,
  notes TEXT,
  urgency INTEGER CHECK (urgency >= 1 AND urgency <= 5),
  impact INTEGER CHECK (impact >= 1 AND impact <= 5),
  effort INTEGER CHECK (effort >= 1 AND effort <= 5),
  prerequisites TEXT,
  status VARCHAR DEFAULT 'pending' 
    CHECK (status IN ('pending', 'in-progress', 'completed')),
  priority VARCHAR DEFAULT 'Low'
    CHECK (priority IN ('Lowest', 'Low', 'Medium', 'Medium-High', 'High', 'Highest')),
  priority_score INTEGER DEFAULT 0,
  classification VARCHAR DEFAULT 'General'
    CHECK (classification IN ('Development', 'Meeting', 'Administrative', 'Bug Fix', 'Research', 'General')),
  is_repeated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX idx_tasks_date ON tasks(date);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_classification ON tasks(classification);
CREATE INDEX idx_tasks_priority_score ON tasks(priority_score DESC);
```

### Data Validation Rules

- **Required Fields**: id, date, activity
- **Optional Fields**: All others with sensible defaults
- **Constraints**: Check constraints for enum values and ranges
- **Relationships**: Currently single-table design for simplicity

## Performance Optimizations

### Frontend Optimizations

1. **Code Splitting**: Lazy loading of route components
2. **Query Optimization**: Specific query keys for targeted cache invalidation
3. **Virtual Scrolling**: For large task lists (future enhancement)
4. **Image Assets**: SVG icons for scalability and performance
5. **Bundle Size**: Tree shaking and dependency optimization

### Backend Optimizations

1. **Database Queries**: 
   - Indexed columns for fast filtering and sorting
   - Specific SELECT statements to avoid N+1 queries
   - Connection pooling for reduced connection overhead

2. **API Response Times**:
   - Average response time: <200ms for CRUD operations
   - Priority calculation: <150ms per task
   - Bulk import: ~50ms per task with throttling

3. **Memory Management**:
   - Streaming file processing for large imports
   - Garbage collection optimization
   - Connection cleanup and resource management

## Security Architecture

### Input Validation
- **Client-side**: React Hook Form with Zod validation
- **Server-side**: Express middleware with Zod schema validation
- **Database**: SQL injection prevention via parameterized queries

### Data Protection
- **Environment Variables**: Sensitive data in .env files
- **Session Management**: PostgreSQL-backed sessions
- **CORS Configuration**: Restricted to allowed origins
- **SQL Injection**: Prevention via Drizzle ORM parameterized queries

### Error Handling
- **Client Errors**: User-friendly messages with technical details in console
- **Server Errors**: Logged with request context, sanitized responses
- **Database Errors**: Connection retry logic with graceful degradation

## Deployment Architecture

### Development Environment
```
Developer Machine
├── Node.js 18+ (local runtime)
├── PostgreSQL (local or remote)
├── Vite Dev Server (frontend)
├── tsx (TypeScript execution)
└── Hot Module Replacement
```

### Production Environment
```
Production Server
├── Built Static Files (served by Express)
├── Bundled Server Code (single JavaScript file)
├── PostgreSQL Database (persistent storage)
├── Environment Variables (configuration)
└── Process Management (PM2 or similar)
```

### Build Process
1. **Frontend**: `vite build` → static files in `dist/public`
2. **Backend**: `esbuild` → single bundled file in `dist/index.js`
3. **Database**: `drizzle-kit push` → schema synchronization
4. **Assets**: Static file optimization and compression

## Monitoring and Observability

### Logging Strategy
- **Request Logging**: All API requests with timing
- **Error Logging**: Structured error information
- **Performance Metrics**: Import/export timing and success rates
- **User Actions**: Critical user interactions for debugging

### Health Checks
- **Database Connectivity**: Connection pool status
- **API Endpoint Availability**: Basic health endpoint
- **Resource Usage**: Memory and CPU monitoring (external)

## Development Guidelines

### Code Organization
```
├── client/src/
│   ├── components/     # Reusable UI components
│   │   ├── ui/        # shadcn/ui base components
│   │   └── custom/    # Application-specific components
│   ├── pages/         # Route-level components
│   ├── lib/           # Utilities and business logic
│   ├── hooks/         # Custom React hooks
│   └── types/         # TypeScript type definitions
├── server/
│   ├── routes.ts      # API endpoint definitions
│   ├── storage.ts     # Database abstraction
│   ├── db.ts          # Database connection
│   └── utils/         # Server-side utilities
├── shared/
│   └── schema.ts      # Shared types and validation
└── docs/              # Documentation
```

### Testing Strategy (Future Implementation)
- **Unit Tests**: Priority engine logic and utility functions
- **Integration Tests**: API endpoints with test database
- **E2E Tests**: Critical user flows with Playwright
- **Performance Tests**: Import/export with large datasets

### Version Control
- **Branch Strategy**: Feature branches with PR reviews
- **Commit Convention**: Conventional commits for changelog generation
- **Release Process**: Semantic versioning with automated builds

This architecture supports the current feature set while providing a foundation for future enhancements including multi-user support, advanced analytics, and mobile applications.