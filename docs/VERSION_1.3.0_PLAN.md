# AxTask Version 1.3.0 - Planned Features

> Status: Legacy planning artifact (non-authoritative).  
> Do not use as active roadmap input; refer to `docs/ACTIVE_LEGACY_INDEX.md` and current canonical docs.

**Planned Release Date**: TBD  
**Status**: Planning Phase  
**Type**: Minor Release

## Overview

Version 1.3.0 focuses on expanding drag-and-drop capabilities across all calendar views, implementing a soft delete system with recycle bin, and adding Replit Auth for Google authentication with world-class security using Replit Secrets.

## What's Already in v1.2.0

Γ£à **Autocomplete Functionality** - Implemented using HTML5 datalist element  
Γ£à **Rounded Average Priority Score** - Dashboard shows 1 decimal place  
Γ£à **Delete Confirmation Dialogs** - Keyboard accessible with visual feedback  
Γ£à **Drag-and-Drop in Hourly Views** - Working in 1h, 2h, 4h, 8h calendar views

## Planned Features

### 1. ≡ƒÄ» Drag-and-Drop Expansion

#### Current State (v1.2.0)
- Drag-and-drop task rescheduling is **only available in hourly views** (1-hour, 2-hour, 4-hour, 8-hour)
- Features GripVertical icon, visual feedback, drop zone highlighting
- Successfully updates task time and shows toast confirmation

#### Planned Enhancements
**Daily View Drag-and-Drop:**
- Drag tasks between different days
- Visual calendar grid with drop zones for each day
- Update task date on drop

**Weekly View Drag-and-Drop:**
- Drag tasks across the 7-day grid
- Drop zones for each day of the week
- Update task date when moved between columns

**Monthly View Drag-and-Drop:**
- Drag tasks between days in monthly calendar
- Visual feedback showing which day is targeted
- Update task date when dropped on new day

#### Technical Implementation
```typescript
// Extend existing drag handlers to work with dates
const handleDrop = (e: React.DragEvent, targetDate: Date) => {
  e.preventDefault();
  if (draggedTask) {
    updateTaskMutation.mutate({ 
      taskId: draggedTask.id, 
      date: format(targetDate, 'yyyy-MM-dd')
    });
  }
};
```

### 2. ≡ƒùæ∩╕Å Soft Delete & Recycle Bin System

#### Database Schema Changes
```sql
-- Add deletedAt column to tasks table
ALTER TABLE tasks ADD COLUMN deleted_at TIMESTAMP NULL;

-- Create index for performance
CREATE INDEX idx_tasks_deleted_at ON tasks(deleted_at);
```

#### Drizzle Schema Update
```typescript
export const tasks = pgTable("tasks", {
  // ... existing fields
  deletedAt: timestamp("deleted_at"),
});
```

#### API Routes
```typescript
// Soft delete endpoint
DELETE /api/tasks/:id
// Sets deleted_at to current timestamp

// Restore endpoint (new)
POST /api/tasks/:id/restore
// Sets deleted_at to NULL

// Recycle bin list (new)
GET /api/tasks/recycle-bin
// Returns tasks where deleted_at IS NOT NULL

// Permanent delete (new)
DELETE /api/tasks/:id/permanent
// Hard delete from database
```

#### Frontend Features
**Recycle Bin Page:**
- New page showing all deleted tasks
- Columns: Task, Deleted Date, Days Remaining, Actions
- Actions: Restore, Permanent Delete
- Auto-calculate days until permanent deletion (30 days)

**Automatic Cleanup:**
- Background job runs daily at midnight
- Permanently deletes tasks where `deleted_at < NOW() - INTERVAL '30 days'`
- Logged in application logs for audit trail

**User Notifications:**
- Toast notification: "Task moved to recycle bin (30 days to restore)"
- Warning before permanent delete: "This action cannot be undone"

### 3. ≡ƒô▒ Drag-to-Delete in Calendar Views

#### Visual Design
When user starts dragging a task:
1. Recycle bin icon appears in bottom-right corner
2. Icon pulses and grows when task is dragged over it
3. Drop zone area highlighted in red
4. On drop: Task soft-deleted with confirmation toast

#### Technical Implementation
```typescript
const [showRecycleBin, setShowRecycleBin] = useState(false);

const handleDragStart = (e: React.DragEvent, task: Task) => {
  setDraggedTask(task);
  setShowRecycleBin(true); // Show recycle bin
};

const handleDragEnd = () => {
  setShowRecycleBin(false); // Hide recycle bin
  setDraggedTask(null);
};

const handleDropOnRecycleBin = (e: React.DragEvent) => {
  e.preventDefault();
  if (draggedTask) {
    deleteTaskMutation.mutate(draggedTask.id); // Soft delete
    setShowRecycleBin(false);
  }
};
```

#### UX Details
- Recycle bin only appears during drag operation
- Hover effect makes it obvious where to drop
- Confirmation toast: "Task moved to recycle bin"
- Undo button in toast (optional): "Restore"

### 4. ≡ƒÜÇ Deployment Structure

#### Production Environment Setup
**Database:**
- Separate production PostgreSQL instance
- Connection pooling configured
- Automated backups (daily + transaction log)

**Environment Variables:**
```bash
# Production
NODE_ENV=production
DATABASE_URL=postgresql://...production-db
SESSION_SECRET=<generated-secret>
GOOGLE_CLIENT_ID=<production-oauth-id>
GOOGLE_CLIENT_SECRET=<production-oauth-secret>
GOOGLE_REDIRECT_URI=https://axtask.com/auth/google/callback
```

**Build Process:**
```bash
# Frontend build
npm run build

# Backend build
npm run build:server

# Start production server
npm run start:prod
```

**Hosting Options:**
- Replit Deployments (recommended for quick setup)
- Vercel (frontend) + Railway/Render (backend)
- AWS/GCP/Azure for enterprise deployments

#### CI/CD Pipeline
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - Checkout code
      - Run tests
      - Build frontend
      - Build backend
      - Deploy to hosting platform
```

### 5. ≡ƒöÉ Replit Auth (Google + Multi-Provider Login)

#### Why Replit Auth?
Replit provides a comprehensive authentication blueprint that supports:
- Google OAuth (primary method)
- GitHub, X (Twitter), Apple login
- Email/password authentication
- OpenID Connect provider integration
- Built-in session management with PostgreSQL
- World-class security out of the box

#### Authentication Implementation
**Using Replit Auth Blueprint (`blueprint:javascript_log_in_with_replit`):**

The integration includes:
1. Complete OAuth 2.0 flow handling
2. Session management with PostgreSQL-backed storage
3. User profile retrieval (email, name, profile picture)
4. Automatic token refresh
5. Protected route middleware (`isAuthenticated`)
6. Frontend authentication hooks (`useAuth`)

#### Database Schema for Users
```typescript
// From Replit Auth blueprint
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Session storage (required by Replit Auth)
export const sessions = pgTable("sessions", {
  sid: varchar("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire").notNull(),
}, (table) => [
  index("IDX_session_expire").on(table.expire)
]);
```

#### Multi-Tenancy for Tasks
```typescript
export const tasks = pgTable("tasks", {
  // ... existing fields
  userId: varchar("user_id").references(() => users.id).notNull(),
});

// All task queries filtered by userId
WHERE user_id = :currentUserId AND deleted_at IS NULL
```

#### API Routes
```typescript
// Authentication endpoints
GET  /auth/google              // Redirect to Google OAuth
GET  /auth/google/callback     // OAuth callback handler
POST /auth/logout              // Destroy session
GET  /auth/me                  // Get current user

// Middleware
requireAuth()                  // Protect routes requiring login
```

#### Frontend Integration
```typescript
// useAuth hook (from Replit Auth blueprint)
import { useAuth } from "@/hooks/useAuth";

const { user, isLoading, isAuthenticated } = useAuth();

// Protected routes in App.tsx
<Switch>
  {isLoading || !isAuthenticated ? (
    <Route path="/" component={Landing} />
  ) : (
    <>
      <Route path="/" component={Dashboard} />
      <Route path="/calendar" component={Calendar} />
      {/* ... other protected routes */}
    </>
  )}
</Switch>

// Login page
<Button onClick={() => window.location.href = "/api/login"}>
  <GoogleIcon /> Sign in with Google
</Button>
```

#### Security Considerations
- HTTPS enforced in production (Replit handles TLS/SSL)
- Secure session cookies: `httpOnly`, `secure`, `sameSite` flags
- CSRF protection built into Replit Auth
- Rate limiting on auth endpoints
- SESSION_SECRET managed via Replit Secrets

### 6. ≡ƒöÉ World-Class API Security with Replit Secrets

#### Why Replit Secrets Outclass Environment Variables

**Traditional Environment Variables:**
- Γ¥î Visible to collaborators in workspace
- Γ¥î Can be logged accidentally
- Γ¥î No rotation mechanism
- Γ¥î Exposed in version control if .env committed

**Replit Secrets:**
- Γ£à **AES-256 encryption at rest**
- Γ£à **TLS encryption in transit**
- Γ£à **Not visible in workspace** (except to owners)
- Γ£à **Collaborative access control** (see names, not values)
- Γ£à **App-level and account-level secrets**
- Γ£à **Never exposed in version control**
- Γ£à **Secure UI for secret management**

#### Implementation Strategy
```typescript
// Access secrets same as environment variables
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const sessionSecret = process.env.SESSION_SECRET;

// But stored in Replit Secrets UI (not .env files)
```

**Secrets to Store:**
- `SESSION_SECRET` - Express session encryption key
- `REPL_ID` - Replit Auth client ID (auto-provided)
- `ISSUER_URL` - Replit OIDC endpoint (auto-provided)
- `DATABASE_URL` - PostgreSQL connection string (auto-provided)
- Any future API keys (Stripe, Twilio, etc.)

#### Best Practices
1. **Never hardcode secrets** in source code
2. **Use Replit Secrets UI** to add/update secrets
3. **Rotate secrets periodically** (SESSION_SECRET every 90 days)
4. **Audit access logs** for unauthorized secret access
5. **Separate dev/prod secrets** (different Replit projects)

### 7. ≡ƒôè Additional Enhancements

#### Recycle Bin Analytics
- Chart showing deletion patterns over time
- Most frequently deleted task types
- Recovery rate statistics

#### Keyboard Shortcuts
- `Ctrl/Cmd + Z` ΓåÆ Undo last deletion (restore from recycle bin)
- `Ctrl/Cmd + Shift + Delete` ΓåÆ Open recycle bin
- `Delete` key on selected task ΓåÆ Move to recycle bin

#### Export Improvements
- Include deleted tasks in export (optional checkbox)
- Export recycle bin separately
- Restore tasks from imported CSV

## Technical Dependencies

### New Packages Required
```json
{
  "dependencies": {
    "passport": "^0.7.0",
    "passport-google-oauth20": "^2.0.0",
    "express-session": "^1.18.0",
    "connect-pg-simple": "^9.0.1"
  }
}
```

### Database Migrations
- Add `deleted_at` column to tasks table
- Create `users` table with Google OAuth fields
- Add `user_id` foreign key to tasks table
- Create indexes for performance

## Migration Path from v1.2.0 to v1.3.0

### Step 1: Database Backup
```bash
# Backup existing database
pg_dump $DATABASE_URL > backup_v1.2.0.sql
```

### Step 2: Run Migrations
```bash
# Apply schema changes
npm run db:push

# Or use Drizzle migrations
npm run db:migrate
```

### Step 3: Data Migration
```bash
# Associate existing tasks with first user (temporary)
UPDATE tasks SET user_id = (SELECT id FROM users LIMIT 1);
```

### Step 4: Deploy Application
```bash
# Pull latest code
git pull origin main

# Install dependencies
npm install

# Build and restart
npm run build
npm run start:prod
```

### Step 5: Verify
- Test soft delete functionality
- Verify recycle bin page loads
- Test Google OAuth login flow
- Check drag-and-drop in all calendar views

## Testing Plan

### Unit Tests
- Soft delete logic
- Recycle bin filtering (30-day rule)
- Date calculations for drag-and-drop

### Integration Tests
- OAuth flow end-to-end
- Session management
- Multi-user task isolation

### E2E Tests (Playwright)
- Drag task to recycle bin in calendar
- Restore task from recycle bin
- Permanent delete after 30 days
- Google login flow
- Drag-and-drop in daily/weekly/monthly views

## Performance Considerations

### Query Optimization
```sql
-- Add index for deleted tasks
CREATE INDEX idx_tasks_deleted_at_user 
ON tasks(user_id, deleted_at);

-- Optimize recycle bin query
SELECT * FROM tasks 
WHERE user_id = :userId 
  AND deleted_at IS NOT NULL 
  AND deleted_at > NOW() - INTERVAL '30 days'
ORDER BY deleted_at DESC;
```

### Caching Strategy
- Cache recycle bin count in Redis
- Invalidate on soft delete/restore
- Reduce database load for dashboard stats

## Documentation Updates

### User Documentation
- "How to recover deleted tasks" guide
- "Using drag-and-drop across calendars" tutorial
- "Signing in with Google" walkthrough

### Developer Documentation
- Authentication flow diagram
- API endpoint reference
- Database schema ERD with users + tasks relationship

## Implementation Notes

### Features Requiring Manual Implementation

Some features in this plan require manual implementation or external setup:

**Replit Auth Integration:**
- Must use `use_integration` tool to add `blueprint:javascript_log_in_with_replit`
- Requires significant code changes to add authentication layer
- Database schema must be updated with users and sessions tables
- All task queries must filter by `userId`

**Production Deployment:**
- Use Replit's built-in "Publish" feature (not manual deployment)
- Replit handles HTTPS, TLS certificates, and domain management
- No CI/CD pipeline needed for Replit deployments

**Background Jobs (30-day cleanup):**
- Consider using cron jobs or scheduled functions
- Alternative: Cleanup on-demand when viewing recycle bin

## Timeline Estimate

- **Soft Delete System**: 2-3 days
- **Drag-and-Drop Expansion**: 3-4 days
- **Replit Auth Integration**: 4-5 days (includes multi-user support)
- **Testing & Documentation**: 3-4 days

**Total Estimated Time**: 12-17 days

## Success Metrics

- 95%+ of users successfully authenticate with Google
- Drag-and-drop works in all 7 calendar views
- Average task recovery time < 2 minutes
- Zero data loss incidents in production
- Application uptime > 99.5%

---

**Status**: This document serves as the planning blueprint for v1.3.0. Features will be prioritized based on user feedback and business value.
