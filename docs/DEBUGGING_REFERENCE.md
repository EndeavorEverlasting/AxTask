# AxTask Debugging Reference

Canonical policy map: [docs/ACTIVE_LEGACY_INDEX.md](ACTIVE_LEGACY_INDEX.md) (active vs transitional vs legacy, dirty-file curation for deployment branches).

## Overview

This document provides solutions to common bugs and debugging patterns encountered during AxTask development. Keep this updated as new issues are discovered and resolved.

**Last Updated:** August 3, 2025

---

## Deployment-Impact Test Sweep Checklist

When changes can affect deployment/runtime behavior (routes, storage/schema, auth, CI, Docker, startup scripts), run this checklist before merge:

1. `npm run check` and confirm no newly introduced type errors in touched areas
2. targeted `npm test -- <path>` for each modified domain
3. migration sanity check for SQL/shared schema updates
4. smoke-check changed API routes with representative payloads

Add unit tests when introducing:

- new schema validation contracts
- new persistence/state transition logic
- new route handlers or behavior branches

---

## Wouter Routing Pitfalls & Cross-Component Communication

### ⚠️ CRITICAL: Wouter `useLocation()` NEVER returns query strings

**Problem (caused five+ failed attempts to fix Alt+N hotkey):**
```typescript
// ❌ BROKEN — wouter's useLocation() returns ONLY the pathname, NEVER the query string
const [location] = useLocation();
const showForm = location.includes("new=1"); // ALWAYS false

// ❌ BROKEN — setLocation with query params is a no-op if already on the same path
setLocation("/tasks?new=1"); // Does nothing when already on /tasks
```

**Root Cause:**
Wouter is a lightweight router. Unlike React Router, `useLocation()` returns only the pathname (`/tasks`), stripping `?query=params` entirely. `setLocation("/tasks?new=1")` when already on `/tasks` is treated as a same-path navigation and ignored.

**Correct Solution — Custom Window Events:**
```typescript
// In App.tsx (global keydown handler):
setLocation("/tasks");
setTimeout(() => window.dispatchEvent(new Event("axtask-open-new-task")), 50);

// In tasks.tsx (receiving component):
useEffect(() => {
  const onOpen = () => setShowForm(true);
  window.addEventListener("axtask-open-new-task", onOpen);
  return () => window.removeEventListener("axtask-open-new-task", onOpen);
}, []);
```

**Why `setTimeout` is needed:** The navigation via `setLocation` needs one tick to mount the target page component before it can receive the event.

**If you MUST read query params**, use wouter's `useSearch()` hook:
```typescript
import { useSearch } from "wouter";
const search = useSearch(); // returns "?new=1" or ""
```

### Custom Event Contracts (canonical list)

| Event Name | Dispatched By | Listened By | Purpose |
|---|---|---|---|
| `axtask-open-new-task` | App.tsx (Alt+N), sidebar button | tasks.tsx | Show task composer form |
| `axtask-focus-task-search` | App.tsx (Alt+F), sidebar button, use-voice.tsx (`prepare_task_search` after navigate) | task-list-host.tsx | Focus the search input; voice uses the same event as keyboard (legacy `task-list.tsx` removed) |
| `axtask-close-voice-bar` | App.tsx (Escape when voice bar open) | use-voice.tsx | Close voice command bar |
| `axtask-toggle-hotkey-help` | use-voice.tsx (voice shortcut) | App.tsx | Toggle keyboard shortcuts dialog |
| `axtask-toggle-sidebar` | use-voice.tsx (voice shortcut) | sidebar.tsx | Toggle sidebar / mobile drawer |
| `axtask-toggle-login-help` | use-voice.tsx (voice shortcut) | login.tsx | Toggle login help overlay |

**Rules for adding new cross-component signals:**
1. Always use `window.dispatchEvent(new Event("axtask-<action>"))` — never query strings
2. Add the event name to this table and to `hotkey-actions.test.ts` (or `keyboard-shortcuts.test.ts` for `KBD` constants)
3. The receiving component must clean up its listener in the `useEffect` return
4. Use `setTimeout(..., 50)` when dispatching after a `setLocation` navigation

### Hotkey Implementation Rules

All keyboard shortcut labels are defined in `client/src/lib/keyboard-shortcuts.ts` (the `KBD` object). Chord matching lives in `client/src/lib/hotkey-actions.ts`; `App.tsx`, `sidebar.tsx`, `use-voice.tsx`, and `login-help-overlay.tsx` apply the resulting actions. The sidebar buttons must fire the same events as the hotkeys.

**Canonical hotkey map (keep in sync with KBD):**
| Hotkey | Action | Mechanism |
|---|---|---|
| Alt+T | Dashboard (all tasks) | `setLocation("/")` |
| Alt+F | Find tasks | `setLocation("/tasks")` + `axtask-focus-task-search` event |
| Alt+N | New task (composer) | `setLocation("/tasks")` + `axtask-open-new-task` event |
| Ctrl+Enter | Submit task form | Handled in task-form.tsx |
| Ctrl+M | Voice commands | Handled in use-voice.tsx |
| Ctrl+Shift+Y | Toggle tutorial | Handled in App.tsx |
| Ctrl+Shift+/ | Hotkey help dialog | Handled in App.tsx |

**Never use `<Link href="/path?param=value">` to trigger component behavior.** Wouter will navigate but the target component won't see the query param.

**Test guardrails:** `client/src/lib/keyboard-shortcuts.test.ts` has 16 tests covering:
- Every KBD constant mapping
- No collisions between hotkeys
- Custom event fire/receive contracts
- Simulated Alt-key dispatch logic
- Non-Alt keypress rejection

---

## Common React/TypeScript Errors

### 1. Undefined Function Error: `setEditingTask is not defined`

**Problem:**
```
Uncaught ReferenceError: setEditingTask is not defined
```

**Root Cause:**
- Missing state variable declaration in component
- Function called without proper state management setup

**Solution:**
```typescript
// Add missing state declaration
const [editingTask, setEditingTask] = useState<Task | null>(null);

// Add required imports
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TaskForm } from "./task-form";
```

**Prevention:**
- Always declare state variables before using them
- Ensure all required imports are present
- Use TypeScript to catch undefined variables at compile time

---

### 2. LSP Diagnostics Errors

**Problem:**
- API response type mismatches
- Missing return type annotations
- Incorrect fetch API usage

**Root Cause:**
- Using custom `apiRequest` function incorrectly
- Expecting wrong response formats

**Solution:**
```typescript
// Replace apiRequest with standard fetch for Google API calls
const response = await fetch('/api/google-sheets/auth-url');
const data = await response.json();

// Handle null values properly
const date = new Date(task.updatedAt || task.createdAt || new Date());
```

**Prevention:**
- Use `get_latest_lsp_diagnostics` tool regularly
- Fix type errors before proceeding with other changes
- Use explicit type annotations for API responses

---

### 3. Event Bubbling Issues

**Problem:**
- Clicking action buttons triggers parent row click handlers
- Unwanted edit dialogs opening when performing other actions

**Solution:**
```typescript
// Add stopPropagation to prevent event bubbling
<TableCell onClick={(e) => e.stopPropagation()}>
  <Button
    onClick={(e) => {
      e.stopPropagation();
      // Your action here
    }}
  >
    Action
  </Button>
</TableCell>
```

**Prevention:**
- Always consider event propagation when nesting clickable elements
- Use stopPropagation() strategically
- Test click interactions thoroughly

---

## Database & API Issues

### 4. Missing API Endpoints

**Problem:**
```
GET /api/tasks/stats 404 in 39ms :: {"message":"Task not found"}
```

**Root Cause:**
- API endpoint not implemented
- Incorrect route handler

**Solution:**
```typescript
// In server/routes.ts, add missing endpoint
app.get('/api/tasks/stats', async (req, res) => {
  try {
    const stats = await storage.getTaskStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
});
```

**Prevention:**
- Check server logs for 404 errors
- Implement all required endpoints before frontend usage
- Use consistent error handling patterns

---

### 5. Null Value Handling

**Problem:**
- Runtime errors when accessing potentially null database fields
- TypeScript warnings about null assignments

**Solution:**
```typescript
// Provide fallback values for null fields
const updatedAt = task.updatedAt || task.createdAt || new Date();

// Use optional chaining
const priority = task.priority?.toString() || '';

// Update storage interface to handle nullable returns
if (updatedTask) {
  task = updatedTask;
}
```

**Prevention:**
- Always handle potential null/undefined values
- Use default values in database schema where appropriate
- Implement proper error boundaries

---

## Import/Export Issues

### 6. File Processing Errors

**Problem:**
- Large file imports causing memory issues
- CSV parsing failures with special characters

**Solution:**
- Implement streaming for large files
- Add proper character encoding handling
- Use try-catch blocks around file operations

**Prevention:**
- Test with various file sizes and formats
- Implement progress tracking for user feedback
- Set reasonable file size limits

---

## Google Sheets API Issues

### 7. Authentication Flow Errors

**Problem:**
- OAuth2 callback failures
- Token refresh issues
- API quota exceeded

**Solution:**
```typescript
// Check credentials before API calls
const credentialsStatus = await googleSheetsClient.checkCredentials();
if (!credentialsStatus.configured) {
  // Handle missing credentials
  return;
}

// Implement proper error handling
try {
  const result = await googleSheetsClient.exportTasks(spreadsheetId, tokens);
} catch (error) {
  if (error.message.includes('credentials')) {
    // Prompt for re-authentication
  }
}
```

**Prevention:**
- Validate API keys before deployment
- Implement proper error messages for users
- Monitor API usage against quotas

---

## Development Workflow Issues

### 8. Failed String Replacements

**Problem:**
```
*No replacement was performed*, old_str did not appear verbatim
```

**Root Cause:**
- Whitespace differences (tabs vs spaces)
- Line ending differences
- Text not matching exactly

**Solution:**
- View the actual file content first
- Copy exact text including whitespace
- Use smaller, more specific replacement strings
- Check for hidden characters

**Prevention:**
- Always use `str_replace_based_edit_tool` with `view` command first
- Use `view_range` to see exact content
- Make targeted edits rather than large blocks

---

### 9. Hot Module Reload Issues

**Problem:**
- Changes not reflecting in browser
- Vite connection errors
- Build cache issues

**Solution:**
- Clear browser cache and reload
- Restart the development server
- Check for syntax errors preventing compilation

**Prevention:**
- Monitor console for HMR connection status
- Fix TypeScript errors promptly
- Use proper import paths

---

## Testing & Validation

### 10. Form Validation Errors

**Problem:**
- Form submissions failing silently
- Zod schema validation mismatches

**Solution:**
```typescript
// Debug form errors
console.log('Form errors:', form.formState.errors);

// Ensure schema matches exactly
const schema = insertTaskSchema.extend({
  // Add any additional validation
});
```

**Prevention:**
- Use consistent validation schemas
- Test form submissions with various inputs
- Implement proper error display

---

## Quick Debugging Checklist

### Before Making Changes:
1. ✅ Check LSP diagnostics for errors
2. ✅ View files before editing them
3. ✅ Verify all imports are present
4. ✅ Check server logs for API errors

### After Making Changes:
1. ✅ Verify changes compiled successfully
2. ✅ Test functionality in browser
3. ✅ Check for new TypeScript errors
4. ✅ Verify no console errors

### Common Error Patterns:
- **Missing imports** → Add required imports
- **Undefined variables** → Declare state/variables
- **API 404 errors** → Implement missing endpoints
- **Type mismatches** → Fix TypeScript definitions
- **Event conflicts** → Use stopPropagation()

---

## Debugging Tools

### Essential Tools:
- **LSP Diagnostics**: `get_latest_lsp_diagnostics` for type errors
- **Browser DevTools**: Console, Network, Elements tabs
- **Server Logs**: Express request/response logging
- **File Viewer**: `str_replace_based_edit_tool` with `view` command

### Best Practices:
1. **Fix errors incrementally** - Resolve one error before introducing changes
2. **Use type safety** - Let TypeScript catch bugs early
3. **Test thoroughly** - Verify changes work as expected
4. **Document solutions** - Update this reference when finding new issues

---

## Emergency Recovery

### If Everything Breaks:
1. **Check recent changes** - Review last few edits
2. **Revert problematic changes** - Use version control or file backup
3. **Restart services** - Restart development server
4. **Clear cache** - Browser and build cache
5. **Check dependencies** - Ensure all packages are installed

### When to Seek Help:
- Multiple failed attempts to fix the same issue
- Unfamiliar error messages
- System-level problems (database, deployment)
- Performance issues requiring optimization

---

*Remember: Debugging is a systematic process. Start with the most specific error, fix it completely, then move to the next issue.*