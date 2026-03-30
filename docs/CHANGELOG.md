# AxTask Changelog

## Version 1.2.0 - November 2, 2025

### ≡ƒÄ¿ User Interface Improvements

#### Autocomplete Functionality
- **Activity Field Autocomplete**: Type in the activity field to see suggestions from previously entered tasks
- **HTML5 Datalist**: Uses native browser autocomplete for fast, lightweight implementation
- **Real-time Updates**: Autocomplete list updates automatically when new tasks are created
- **Sorted Alphabetically**: Suggestions appear in alphabetical order for easy scanning

#### Dashboard Enhancements
- **Rounded Average Priority Score**: Displays as single decimal (e.g., "42.5") to prevent UI overflow
- **Statistics Fix**: Dashboard now correctly displays total tasks, high priority count, and completion metrics
- **Fix**: Resolved route ordering issue where `/api/tasks/stats` was matched as `/api/tasks/:id`

#### Dynamic Focus Glow Effects
- **Green Glow**: Task form glows green when focus is on Add Task or Update Task button
- **Red Glow**: Form glows red when focus is on Delete button (both in form and All Tasks table)
- **Grey Glow**: Form glows grey when focus is on Cancel button
- **Purpose**: Improves accessibility at 100% zoom by making focused actions visible even when buttons are off-screen
- **Keyboard Navigation**: Users can now press Tab to navigate and Enter to submit without seeing the button

#### Button Improvements
- **Clear ΓåÆ Cancel**: Renamed "Clear" button to "Cancel" for better clarity
- **Cancel Functionality**: Clicking Cancel now closes the form instead of clearing fields
- **Delete Button**: Only visible when editing existing tasks (not for new task creation)
- **Confirmation Dialog**: Displays task details before deletion to prevent accidents

#### Auto-Focus Enhancement
- **Quick Task Entry**: First field in the task form automatically receives focus
- **Tab Order**: Pressing Tab from anywhere on the dashboard focuses the date input first
- **Rationale**: Matches the "Quick Task Entry" name and speeds up task creation workflow

### ≡ƒùæ∩╕Å Task Deletion Features

#### Hard Delete with Confirmation
- **Permanent Deletion**: Tasks are permanently deleted (hard delete)
- **Delete Confirmation**: All delete actions require user confirmation with task preview
- **Visual Feedback**: Toast notifications confirm successful deletion
- **Note**: Soft delete with recycle bin system is planned for v1.3.0

#### Delete Locations
1. **Task Form**: Red delete button when editing existing tasks
2. **All Tasks Table**: Trash icon button in the Actions column (glows red on focus)

#### Planned for v1.3.0
- **Soft Delete System**: Recycle bin with 30-day retention before permanent deletion
- **Drag-to-Delete**: Drag tasks to recycle bin in calendar views
- **Restore Capability**: Undo deletions within 30-day window

### ≡ƒöä Data Synchronization

#### Auto-Refresh System
- **Polling Interval**: Data refreshes every 30 seconds automatically
- **Window Focus**: Data refreshes when user returns to browser tab
- **Stale Time**: Data considered fresh for 10 seconds
- **Purpose**: Prevents data loss when users spend time filling out detailed notes

### ≡ƒÄ» Calendar Enhancements (from v1.1.0)

#### Time Field Implementation
- **Automatic Time Capture**: Tasks record creation time in HH:MM format
- **Time Picker**: Default value set to current time at submission
- **Accurate Display**: Tasks appear in correct hourly time slots (not midnight)
- **Drag-and-Drop Rescheduling**: Move tasks between time slots in hourly views

#### Click-to-Edit Workflow
- **All Calendar Views**: Click any task to view details
- **Edit Button**: Opens task form with pre-filled data
- **Real-time Updates**: Changes reflect immediately across all views

#### Boundary Fix
- **Half-Open Intervals**: Tasks scheduled exactly on the hour appear in only one time block
- **No Duplicates**: Prevents tasks from rendering in multiple adjacent time slots

### ≡ƒ¢á∩╕Å Technical Improvements

#### Query Client Configuration
```typescript
{
  refetchInterval: 30000,        // Auto-refresh every 30 seconds
  refetchOnWindowFocus: true,     // Refresh on tab focus
  staleTime: 10000,              // Fresh for 10 seconds
}
```

#### CSS :has() Selector Usage
- Dynamic parent styling based on focused child elements
- No JavaScript event listeners required
- Better performance and cleaner code

#### Accessibility Enhancements
- All interactive elements have `data-testid` attributes
- Keyboard navigation fully supported
- Focus states clearly visible at all zoom levels
- ARIA labels and roles properly implemented

### ≡ƒôï Migration Guide

No database migrations required for this version. All changes are frontend and configuration updates.

### ≡ƒÉ¢ Bug Fixes

- Fixed JSON parse error when deleting tasks (DELETE returns 204 with no body)
- Fixed form submission to properly close dialogs on cancel
- Improved drag-and-drop event handling with stopPropagation
- **Drag-and-Drop Attribute Fix**: Changed `draggable` to `draggable={true}` for explicit boolean rendering
- **Dashboard Statistics Fix**: Corrected route ordering to prevent `/stats` being matched as task ID
- **Test Identifiers**: Added `data-testid="draggable-task-{id}"` for better testing and debugging

### ≡ƒÜÇ Performance

- TanStack Query cache optimization
- Optimistic UI updates for smooth UX
- Minimal re-renders with proper React hooks

---

## Version 1.1.0 - November 2, 2025

### Calendar View Implementation
- Multiple time scale views (1-hour, 2-hour, 4-hour, 8-hour, daily, weekly, monthly)
- Task density heatmaps
- Priority distribution visualizations
- Drag-and-drop task rescheduling in hourly views

### Priority Engine
- Automatic priority calculation based on urgency, impact, effort
- Keyword detection and classification
- Duplicate task detection using Jaccard similarity
- Tag-based priority adjustments

---

## Version 1.0.0 - Initial Release

### Core Features
- Task creation with automatic priority calculation
- Google Sheets integration
- Import/Export functionality (CSV and Excel)
- Analytics dashboard
- Mobile-responsive design
