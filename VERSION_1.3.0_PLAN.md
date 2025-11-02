# AxTask Version 1.3.0 - Planned Features

**Planned Release Date**: TBD  
**Status**: Planning Phase  
**Type**: Minor Release

## Overview

Version 1.3.0 focuses on expanding drag-and-drop capabilities across all calendar views, implementing a soft delete system with recycle bin, and adding production deployment infrastructure with Google authentication.

## Planned Features

### 1. 🎯 Drag-and-Drop Expansion

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

### 2. 🗑️ Soft Delete & Recycle Bin System

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

### 3. 📱 Drag-to-Delete in Calendar Views

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

### 4. 🚀 Deployment Structure

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

### 5. 🔐 Google Authentication

#### Authentication Strategy
**OAuth 2.0 Flow:**
1. User clicks "Sign in with Google"
2. Redirect to Google OAuth consent screen
3. User authorizes application
4. Google redirects back with authorization code
5. Exchange code for access token
6. Retrieve user profile (email, name, picture)
7. Create/update user in database
8. Create session and redirect to dashboard

#### Database Schema for Users
```typescript
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  name: varchar("name"),
  picture: varchar("picture"),
  googleId: varchar("google_id").unique().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});
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
// useAuth hook
const { user, loading, login, logout } = useAuth();

// Protected routes
<Route path="/dashboard">
  {user ? <Dashboard /> : <Navigate to="/login" />}
</Route>

// Login page
<Button onClick={login}>
  <GoogleIcon /> Sign in with Google
</Button>
```

#### Security Considerations
- HTTPS required in production (TLS/SSL certificates)
- Secure session cookies with `httpOnly`, `secure`, `sameSite` flags
- CSRF protection using tokens
- Rate limiting on auth endpoints (prevent brute force)
- Input validation and sanitization

### 6. 📊 Additional Enhancements

#### Recycle Bin Analytics
- Chart showing deletion patterns over time
- Most frequently deleted task types
- Recovery rate statistics

#### Keyboard Shortcuts
- `Ctrl/Cmd + Z` → Undo last deletion (restore from recycle bin)
- `Ctrl/Cmd + Shift + Delete` → Open recycle bin
- `Delete` key on selected task → Move to recycle bin

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

## Timeline Estimate

- **Soft Delete System**: 2-3 days
- **Drag-and-Drop Expansion**: 3-4 days
- **Google Authentication**: 4-5 days
- **Deployment Infrastructure**: 2-3 days
- **Testing & Documentation**: 3-4 days

**Total Estimated Time**: 14-19 days

## Success Metrics

- 95%+ of users successfully authenticate with Google
- Drag-and-drop works in all 7 calendar views
- Average task recovery time < 2 minutes
- Zero data loss incidents in production
- Application uptime > 99.5%

---

**Status**: This document serves as the planning blueprint for v1.3.0. Features will be prioritized based on user feedback and business value.
