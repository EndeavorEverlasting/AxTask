
# AxTask Version 1.3.0 - "Context + Control"

**Planned Release Date**: Q2 2025  
**Status**: In Development  
**Type**: Minor Release

## Overview

Version 1.3.0 introduces context-aware productivity with safe, reversible actions. This release combines expanded drag-and-drop capabilities, soft delete with recycle bin, authentication and multi-tenancy, location-based reminders (local-only), voice input, and unified settings/privacy controls.

**Theme:** Context-aware productivity with safe, reversible actions.

**Scope (Epics):**
- Calendar DnD everywhere
- Soft Delete & Recycle Bin
- Auth & Multi-tenancy
- Location Reminders (local-only)
- Voice Input
- Unified Settings/Privacy
- Keyboard-Driven Navigation & Quick Find

## Release Strategy

### Phase 1 (Core - Priority)
- Calendar DnD expansion (day/week/month views)
- Soft Delete + Recycle Bin
- Replit Auth integration
- Settings page scaffold

### Phase 2 (Context - Follow-up)
- Location field + local geofence notifications with cooldown
- Voice input for activity/notes fields

### Feature Flags
- `feature.recycleBin`
- `feature.dragToDelete`
- `feature.locationReminders`
- `feature.voiceInput`

## What's Already in v1.2.0

✅ **Autocomplete Functionality** - Implemented using HTML5 datalist element  
✅ **Rounded Average Priority Score** - Dashboard shows 1 decimal place  
✅ **Delete Confirmation Dialogs** - Keyboard accessible with visual feedback  
✅ **Drag-and-Drop in Hourly Views** - Working in 1h, 2h, 4h, 8h calendar views

## Epic 1: Calendar Drag-and-Drop Everywhere

### Current State (v1.2.0)
- Drag-and-drop task rescheduling **only available in hourly views** (1-hour, 2-hour, 4-hour, 8-hour)
- Features GripVertical icon, visual feedback, drop zone highlighting
- Successfully updates task time and shows toast confirmation

### Planned Enhancements

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
- Update task date when dropped

**Shared Handler (Cross-View):**
```typescript
const handleDropToDate = (taskId: string, targetDate: Date) =>
  updateTaskMutation.mutate({ 
    taskId, 
    date: format(targetDate, 'yyyy-MM-dd') 
  });
```

**Invariants:**
- Same mutation path across all views
- Same undo window behavior
- Consistent visual feedback

## Epic 2: Soft Delete + Recycle Bin

### Database Schema
```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(deleted_at);
```

### API Endpoints
```
DELETE /api/tasks/:id              // Soft delete -> set deleted_at=now()
POST   /api/tasks/:id/restore      // Restore -> deleted_at=NULL
GET    /api/tasks/recycle-bin      // List deleted tasks
DELETE /api/tasks/:id/permanent    // Hard delete (admin only)
```

### UX Features

**Recycle Bin Page:**
- List view showing: Task | Deleted Date | Days Remaining | Actions
- Restore button per task
- Permanent delete option (with additional confirmation)
- Auto-cleanup: Tasks older than 30 days are permanently deleted

**Drag-to-Delete Target:**
- Visual recycle bin appears during drag operations
- Drop task on bin icon = soft delete
- Toast notification with **Undo** button (5-second window)

**Confirmation Dialogs:**
- Soft delete: Simple confirmation
- Permanent delete: Stronger warning with explicit confirmation

### Implementation Notes
- Default queries filter `WHERE deleted_at IS NULL`
- Recycle bin queries use `WHERE deleted_at IS NOT NULL`
- Nightly cleanup job removes tasks where `deleted_at < NOW() - INTERVAL '30 days'`

## Epic 3: Authentication & Multi-Tenancy

### Architecture

**Replit Auth Integration:**
- Google as primary provider
- Optional: GitHub, email/password in future releases
- Secure session management with HTTP-only cookies

**Database Schema:**
```typescript
export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  email: varchar("email").notNull().unique(),
  name: varchar("name"),
  avatar: text("avatar"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tasks = pgTable("tasks", {
  // ...existing fields
  userId: varchar("user_id").notNull(), // FK to users.id
  deletedAt: timestamp("deleted_at"),
  location: text("location").default(''), // See Epic 4
});

// Indexes
createIndex("idx_tasks_user_deleted").on(tasks.userId, tasks.deletedAt);
```

### Query Scoping
All task queries must be scoped:
```typescript
WHERE user_id = :currentUserId AND (deleted_at IS NULL OR :includeDeleted)
```

### API Endpoints
```
GET  /auth/google              // Initiate Google OAuth
GET  /auth/google/callback     // OAuth callback
POST /auth/logout              // Clear session
GET  /auth/me                  // Current user info
```

### Security
- HTTPS enforced
- HTTP-only, Secure cookies
- Rate limiting on auth routes
- Secrets via Replit Secrets (not .env)

## Epic 4: Location Intelligence (Privacy-First)

### Principles
- **Server stores ONLY human-readable `tasks.location` string**
- **Live coordinates NEVER leave the device** (stored in IndexedDB/localStorage)
- **Geofence checks run client-side only**
- **Opt-in by default** - disabled until user enables

### Client-Side Services

**location-notifications.ts:**
```typescript
// Haversine distance calculation
const withinRadius = (
  a: {lat: number, lon: number}, 
  b: {lat: number, lon: number}, 
  radiusMeters: number
): boolean => {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => deg * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat/2)**2 + 
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * 
    Math.sin(dLon/2)**2;
  const distance = 2 * R * Math.asin(Math.sqrt(s));
  return distance <= radiusMeters;
};

// Geofence monitoring
class LocationNotificationService {
  private watchId: number | null = null;
  private cooldowns = new Map<string, number>(); // location key -> timestamp
  private savedPlaces: Array<{name: string, lat: number, lon: number, radius: number}> = [];
  
  async requestPermissions() {
    // Request Geolocation + Notifications permissions
  }
  
  startWatching() {
    // Throttled position watching
    // Match nearby tasks by location name
    // Respect 30-minute cooldown per location
  }
  
  checkGeofences(currentPosition: GeolocationPosition) {
    // Match against savedPlaces
    // Trigger OS notification for nearby tasks
    // Update cooldown timestamps
  }
}
```

### Features
- **Saved Places**: User defines locations with name + coordinates + radius (stored locally)
- **Autocomplete**: Server provides unique location strings from `tasks.location`
- **Cooldown**: 30-minute default (configurable) to prevent notification spam
- **Notifications**: OS-level notifications when entering geofence

### API Endpoints
```
GET /api/tasks/autocomplete/locations   // Returns unique location strings (text only)
```

### Data Flow
```
User enters "Office" in location field
  ↓
Client suggests from autocomplete (text strings)
  ↓
User can optionally map "Office" to coordinates locally
  ↓
Server stores only "Office" in tasks.location
  ↓
Client monitors GPS, checks if near saved "Office" coordinates
  ↓
Triggers notification when within radius (if cooldown expired)
```

## Epic 5: Voice Input

### Implementation

**Web Speech API Integration:**
```typescript
const startDictation = async (
  onText: (text: string) => void
): Promise<{supported: boolean}> => {
  // @ts-ignore - Web Speech API may not be in types
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    return { supported: false };
  }
  
  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  
  recognition.onresult = (event: any) => {
    const transcript = event.results[0][0].transcript;
    onText(transcript);
  };
  
  recognition.onerror = (event: any) => {
    console.error('Speech recognition error:', event.error);
  };
  
  recognition.start();
  return { supported: true };
};
```

### Features
- Microphone button on **Activity** and **Notes** fields
- Visual indicator when recording
- Graceful fallback for unsupported browsers
- Respects settings toggle (off by default)
- Cancel/timeout handling

### Browser Support
- Chrome/Edge: Full support
- Safari: Limited support
- Firefox: No WebKit Speech API support (show fallback message)

## Epic 6: Settings & Privacy

### Settings Page Sections

**1. Account & Authentication**
- Sign in/out (Replit Auth)
- Profile information
- Connected accounts

**2. Privacy & Data**
- **Location Processing**: "Local-only, opt-in" explanation
- Clear description of what data is stored server-side vs. client-side
- Revoke permissions button
- Data export option

**3. Feature Toggles**
- ☐ Enable Recycle Bin
- ☐ Enable Drag-to-Delete
- ☐ Enable Location Reminders (off by default)
- ☐ Enable Voice Input (off by default)

**4. Location Settings** (if enabled)
- Manage Saved Places (name, coordinates, radius)
- Cooldown duration (default: 30 minutes)
- Clear all location data button

**5. Notifications**
- App notifications (toasts)
- OS notifications (for geofence)
- Notification sound preferences

### Security Hardening
- HTTPS enforcement
- Secure, HTTP-only cookies
- Rate limiting on auth routes
- Secrets management via **Replit Secrets**:
  - `SESSION_SECRET`
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`

## Database Migration

### Single Unified Migration
```typescript
await db.execute(sql`
  -- Add new columns
  ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS user_id VARCHAR NOT NULL DEFAULT 'system',
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL,
    ADD COLUMN IF NOT EXISTS location TEXT DEFAULT '';
  
  -- Add indexes
  CREATE INDEX IF NOT EXISTS idx_tasks_user_deleted 
    ON tasks(user_id, deleted_at);
  
  CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at 
    ON tasks(deleted_at);
`);

// Backfill user_id for existing tasks
await db.execute(sql`
  UPDATE tasks 
  SET user_id = 'legacy_owner' 
  WHERE user_id = 'system';
`);
```

## API Surface (Complete)

### Authentication
```
GET  /auth/google              // Initiate OAuth
GET  /auth/google/callback     // OAuth callback
POST /auth/logout              // Clear session
GET  /auth/me                  // Current user
```

### Tasks (Enhanced)
```
GET    /api/tasks                        // List user's tasks
POST   /api/tasks                        // Create task
GET    /api/tasks/:id                    // Get task
PATCH  /api/tasks/:id                    // Update (including DnD date moves)
DELETE /api/tasks/:id                    // Soft delete
POST   /api/tasks/:id/restore            // Restore from recycle bin
DELETE /api/tasks/:id/permanent          // Hard delete
GET    /api/tasks/recycle-bin            // List deleted tasks
GET    /api/tasks/autocomplete/activities
GET    /api/tasks/autocomplete/locations // Text strings only
```

### Feature Flags
```
GET /api/feature-flags         // Per-user feature flag state
```

## Deployment & CI/CD

### Secrets Configuration (Replit Secrets)
```bash
SESSION_SECRET=<random-256-bit-key>
GOOGLE_CLIENT_ID=<oauth-client-id>
GOOGLE_CLIENT_SECRET=<oauth-client-secret>
DATABASE_URL=<postgres-connection-string>
```

### Deployment Pipeline
1. **Build**: `npm run build`
2. **Test**: Run unit + integration tests
3. **Migrate**: Run database migrations
4. **Deploy**: Replit deployment
5. **Smoke Test**: Verify auth flow, DnD, recycle bin

### Rollout Strategy
1. Deploy Phase 1 features (DnD, Recycle Bin, Auth) to all users
2. Enable `locationReminders` and `voiceInput` for beta cohort
3. Monitor metrics and error rates
4. Gradual rollout to 100% based on feedback

## QA Testing Matrix

### Browser Testing
- ✓ Chrome (full support)
- ✓ Edge (full support)
- ✓ Safari (limited voice support)
- ✓ Firefox (no voice, fallback messaging)

### Permission Scenarios
- Grant/Deny/Revoke: Geolocation
- Grant/Deny/Revoke: Notifications
- Grant/Deny/Revoke: Microphone

### Drag-and-Drop Testing
- Hourly ↔ Day/Week/Month view transitions
- Cross-month drops
- Undo behavior in all views
- Drag-to-delete target

### Soft Delete Testing
- List deleted tasks
- Restore functionality
- Permanent delete
- 30-day cleanup job
- Undo within 5-second window

### Location Testing
- Radius hit detection
- Cooldown respected (no duplicate notifications)
- No server traffic with coordinates (verify network tab)
- Saved places CRUD operations

### Voice Testing
- Dictation inserts expected text
- Cancel/timeout paths
- Fallback message in unsupported browsers

## Metrics (Privacy-Safe Counters)

### Usage Metrics
- Tasks moved via DnD (count only, no content)
- Soft deletes performed
- Tasks restored from recycle bin
- Permanent deletes executed

### Feature Adoption
- Voice input activations (boolean counter)
- Location reminders shown (count)
- Users with location features enabled

### Error Rates
- Auth failures
- API non-200 responses
- Speech recognition errors

## Acceptance Criteria

### Must Pass to Ship 1.3.0

**Calendar DnD:**
- ✓ Move task in Day view → date updates
- ✓ Move task in Week view → date updates
- ✓ Move task in Month view → date updates
- ✓ Undo works in all views
- ✓ Visual feedback consistent across views

**Soft Delete:**
- ✓ Delete via button → appears in Recycle Bin
- ✓ Drag to delete target → soft deletes
- ✓ Restore from Recycle Bin → task reappears
- ✓ Undo within 5 seconds works
- ✓ 30-day cleanup executes

**Authentication:**


## Epic 7: Keyboard-Driven Navigation & Quick Find

### Status: ✅ Implemented (April 2026)

### Implemented Hotkeys

| Hotkey | Action | Implementation |
|---|---|---|
| **Alt+T** | Open dashboard (load all tasks) | `setLocation("/")` in App.tsx |
| **Alt+F** | Find tasks (focus search input) | Navigate to `/tasks` + `axtask-focus-task-search` event |
| **Alt+N** | New task (open composer) | Navigate to `/tasks` + `axtask-open-new-task` event |
| **Ctrl+Enter** | Submit task form | Handler in task-form.tsx |
| **Ctrl+M / Cmd+M** | Voice commands | Handler in use-voice.tsx |
| **Ctrl+Shift+Y** | Toggle tutorial | Handler in App.tsx |
| **Ctrl+Shift+/** | Hotkey help dialog | Handler in App.tsx |
| **Ctrl+Shift+B** | Toggle sidebar | Handler in sidebar.tsx |

### Architecture

**Canonical source of truth:** `client/src/lib/keyboard-shortcuts.ts` (the `KBD` constant object)

**⚠️ CRITICAL LESSON LEARNED (5+ failed attempts):**
Wouter's `useLocation()` returns **only the pathname**, never query strings.
`setLocation("/tasks?new=1")` is a no-op when already on `/tasks`.
**Never use URL query params to trigger component behavior.** Use custom window events instead.

**Cross-component communication pattern:**
```typescript
// In App.tsx (hotkey handler) or sidebar button onClick:
setLocation("/tasks");
setTimeout(() => window.dispatchEvent(new Event("axtask-open-new-task")), 50);

// In tasks.tsx (receiving component):
useEffect(() => {
  const onOpen = () => setShowForm(true);
  window.addEventListener("axtask-open-new-task", onOpen);
  return () => window.removeEventListener("axtask-open-new-task", onOpen);
}, []);
```

The `setTimeout(..., 50)` is required because the target page needs one tick to mount after `setLocation` navigates.

### Sidebar Buttons

Three gradient action buttons in the sidebar (in order):
1. **All Tasks** (emerald→teal→cyan) — `Alt+T` — navigates to dashboard
2. **Find Tasks** (violet→fuchsia→pink) — `Alt+F` — navigates to `/tasks`, focuses search, has classification orbs
3. **Add Task** (blue→indigo) — `Alt+N` — navigates to `/tasks`, opens task composer

Sidebar buttons must fire **the same events** as the corresponding hotkeys. They are not independent implementations.

### Test Guardrails

`client/src/lib/keyboard-shortcuts.test.ts` — **16 tests** covering:
- Every KBD constant mapping (Alt+T, Alt+N, Alt+F, voice, submit, etc.)
- No collisions between dashboard, newTask, and findTasks hotkeys
- Custom event fire/receive contracts (`axtask-open-new-task`, `axtask-focus-task-search`)
- Simulated Alt-key dispatch verifying handler routing logic
- Non-Alt keypress rejection (ensures no false triggers)
- Browser-reserved key avoidance (Ctrl+T, Cmd+T)

### Future Enhancements (Post-1.3.0)
- Arrow key navigation (↑↓) between task rows in the table
- Vim-style keybindings (j/k for down/up)
- Quick actions (d = delete, c = complete) without opening task
- Multi-select with Shift+Arrow
- Full QuickFind overlay component with real-time filtering

- ✓ Google login works
- ✓ Tasks scoped per user
- ✓ Logout clears session
- ✓ Unauthorized access blocked

**Settings:**
- ✓ Toggles persist across sessions
- ✓ Location/Voice off by default
- ✓ Privacy explanations clear
- ✓ Revoke permissions works

**Location (when enabled):**
- ✓ Reminders trigger locally
- ✓ Server never receives coordinates
- ✓ Cooldown prevents spam
- ✓ Saved places managed correctly

**Voice (when enabled):**
- ✓ Works in Chrome/Edge
- ✓ Graceful fallback in Firefox/Safari
- ✓ Recording indicator visible
- ✓ Cancel/error handling works

## Next Steps (Actionable)

1. **Database Migration**: Implement unified migration adding `user_id`, `deleted_at`, `location`
2. **Auth Integration**: Set up Replit Auth with Google provider
3. **Recycle Bin**: Build API endpoints + UI page
4. **Drag-to-Delete**: Add visual overlay during drag operations
5. **DnD Expansion**: Extend to Day/Week/Month views with shared handlers
6. **Settings Page**: Create comprehensive settings UI with privacy controls
7. **Feature Flags**: Implement flag system for gradual rollout
8. **Location Service**: Build client-side geofence monitoring (behind flag)
9. **Voice Input**: Add microphone buttons with Web Speech API (behind flag)
10. **QA Testing**: Execute full testing matrix
11. **Beta Release**: Enable location/voice for limited cohort
12. **Monitor & Iterate**: Collect feedback, adjust before full rollout

## Known Limitations

### Multi-User Conflicts
- **Current**: 30-second polling may miss rapid changes
- **Impact**: Low (most users work individually)
- **Future**: WebSocket real-time sync (Version 2.0)

### Browser Compatibility
- Voice input requires Chrome/Edge for full support
- Location services require HTTPS (already enforced)
- Geolocation permissions vary by browser

### Performance Considerations
- Location monitoring throttled to conserve battery
- Geofence checks client-side only (no server load)
- Feature flags prevent unused code from loading

## Upgrade Path

### From v1.2.0 to v1.3.0

**Required Steps:**
1. Run database migration (adds columns + indexes)
2. Configure Replit Secrets for auth
3. Deploy updated codebase
4. Clear browser cache for users (CSS/JS updates)

**Data Migration:**
- Existing tasks: `user_id` backfilled to legacy owner
- `deleted_at` defaults to NULL (no tasks soft-deleted)
- `location` defaults to empty string

**No Breaking Changes:**
- All existing features remain functional
- New features opt-in via settings
- API backward compatible (new endpoints only)
