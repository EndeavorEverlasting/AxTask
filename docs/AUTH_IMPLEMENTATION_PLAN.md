# AxTask — User Accounts Implementation Plan

## Overview

Every task needs to belong to the user who created it. When you log in, you see only your tasks. When you log out, nothing is accessible. This document lays out exactly how to get there.

## Recommended Approach: Passport.js + Sessions

**Why not Neon Auth?** Neon Auth (powered by Stack Auth) is built for Next.js apps and uses JWT/JWKS validation. AxTask runs Express + React — a different pattern. The good news: your project already has `passport`, `express-session`, and `connect-pg-simple` installed. These are the standard, battle-tested tools for exactly this stack.

**Why not Clerk / Auth0 / external providers?** They add a third-party dependency, recurring cost, and vendor lock-in. For a system you own and want to containerize, keeping auth self-hosted is simpler and more portable.

## Architecture

```
Browser → React App → Express API (session cookie) → PostgreSQL
                         ↓
                    Passport.js validates session
                         ↓
                    req.user.id injected into every request
                         ↓
                    Storage layer filters tasks by userId
```

## Implementation Steps

### Phase 1: Database — Users Table & Task Ownership

**File: `shared/schema.ts`**

1. Add a `users` table:
   - `id` (UUID, primary key)
   - `email` (unique, not null)
   - `passwordHash` (text, not null)
   - `displayName` (text)
   - `createdAt` (timestamp)

2. Add `userId` column to `tasks` table:
   - Foreign key → `users.id`
   - Not null (new tasks must belong to someone)

3. Create Zod schemas: `insertUserSchema`, `loginSchema`

4. Run `npm run db:push` to apply changes

**Migration strategy for existing tasks:** Add `userId` as nullable first, assign all existing tasks to the first registered user, then make it not-null.

### Phase 2: Server — Auth Middleware

**File: `server/auth.ts` (new)**

1. Configure `express-session` with `connect-pg-simple` (PostgreSQL session store)
2. Configure `passport` with `passport-local` strategy (email + password)
3. Use `bcrypt` for password hashing (install: `npm install bcrypt @types/bcrypt`)
4. Export middleware: `requireAuth` — returns 401 if not logged in

**File: `server/routes.ts`**

5. Add auth routes:
   - `POST /api/auth/register` — create account
   - `POST /api/auth/login` — log in (creates session)
   - `POST /api/auth/logout` — destroy session
   - `GET /api/auth/me` — return current user (or 401)

6. Protect all `/api/tasks/*` routes with `requireAuth` middleware
7. Inject `req.user.id` into all storage calls

**File: `server/storage.ts`**

8. Update every method to accept and filter by `userId`:
   - `getTasks(userId)` → `WHERE user_id = ?`
   - `createTask(userId, data)` → inserts with `userId`
   - `updateTask(userId, id, data)` → ensures ownership
   - `deleteTask(userId, id)` → ensures ownership

### Phase 3: Client — Login UI & Protected Routes

**File: `client/src/lib/auth-context.tsx` (new)**

1. React context that holds the current user state
2. On app load, call `GET /api/auth/me` to check if logged in
3. Provide `login()`, `register()`, `logout()` functions
4. Wrap the entire app in `<AuthProvider>`

**File: `client/src/pages/login.tsx` (new)**

5. Login page with email + password form
6. Registration form (toggle between login/register)
7. Redirects to Dashboard on success

**File: `client/src/App.tsx`**

8. Add route guard: if not logged in, redirect all routes to `/login`
9. Add `/login` route

**File: `client/src/components/layout/sidebar.tsx`**

10. Show user's display name / email at bottom of sidebar
11. Add "Log out" button

### Phase 4: Session Security

**File: `server/auth.ts`**

- Session cookie: `httpOnly`, `secure` (in production), `sameSite: lax`
- Session expiry: 7 days (configurable via env var)
- Rate limiting on `/api/auth/login` (prevent brute force)

**Environment variables to add to `.env`:**
```
SESSION_SECRET=<random-64-char-string>
```

## New Dependencies Required

```bash
npm install bcrypt passport-local
npm install --save-dev @types/bcrypt @types/passport-local
```

Everything else (`passport`, `express-session`, `connect-pg-simple`) is already installed.

## File Change Summary

| File | Change |
|------|--------|
| `shared/schema.ts` | Add `users` table, `userId` to `tasks`, new Zod schemas |
| `server/auth.ts` | **New** — Passport config, session setup, `requireAuth` middleware |
| `server/routes.ts` | Add auth routes, protect task routes with `requireAuth` |
| `server/storage.ts` | Add user CRUD, filter all task queries by `userId` |
| `server/index.ts` | Wire up session + passport middleware before routes |
| `client/src/lib/auth-context.tsx` | **New** — React auth context + hooks |
| `client/src/pages/login.tsx` | **New** — Login/register page |
| `client/src/App.tsx` | Add login route, protect other routes |
| `client/src/components/layout/sidebar.tsx` | Show user info, logout button |

## Estimated Effort

| Phase | Time |
|-------|------|
| Phase 1: Database | ~15 min |
| Phase 2: Server auth | ~30 min |
| Phase 3: Client UI | ~30 min |
| Phase 4: Security hardening | ~15 min |
| **Total** | **~1.5 hours** |

## Future Enhancements (not in scope now)

- **Sign-up verification (OTP)** for **new** registrations to cut spam and scripted signups — see [`MFA_SIGNUP_VERIFICATION.md`](./MFA_SIGNUP_VERIFICATION.md). Existing users are **not** required to use MFA for routine login; step-up MFA stays limited to flows that already need it (billing, etc.).
- **Row Level Security** in PostgreSQL for defense-in-depth
- **Password reset** flow with email verification
- **Team/org accounts** with shared task visibility
- **API keys** for programmatic access

## Docker Readiness

This approach is fully Docker-compatible. The session store uses PostgreSQL (same `DATABASE_URL`), so no Redis or extra services needed. The only env vars required are `DATABASE_URL` and `SESSION_SECRET`.

