# AxTask — operator & local testing runbook (TEMPLATE)

**Instructions:** Replace every `YOUR_*` placeholder. Do **not** commit a filled version to a **public** repository — use **`OPERATOR_RUNBOOK.md`** in this folder (gitignored) or a **private wiki**.

**Code references:** `server/seed-dev.ts` (dev accounts), `server/routes.ts` (`requireAdmin`, `requireAdminRole`, admin step-up).

---

## 1. Unblock local testing (Node.js + PostgreSQL)

Use this when you want **`npm run dev` / `npm run local:start`** against Postgres on your machine (not Docker).

### 1.1 Prerequisites

- Node.js >=20.16 (see `package.json` `engines.node`) and npm
- PostgreSQL running and reachable (create an empty database if needed, e.g. `axtask`)

### 1.2 One-time setup (project root)

1. `git clone` / `cd AxTask` (optional: `npm run submodule:init` verifies NodeWeaver sources under `NodeWeaver/`).
2. **`npm run local:env-init`**  
   - Creates `.env` from `.env.example` if missing.  
   - Writes a strong **`SESSION_SECRET`** without printing it.
3. Edit **`.env`** and set **`DATABASE_URL`** to your instance, for example:  
   `postgresql://postgres:postgres@localhost:5432/axtask`
4. Start the stack: **`npm run local:start`**  
   (or manually: `npm install`, **`npm run db:push`**, then **`npm run dev`** — ensure **`NODE_ENV=development`** for seeded dev accounts).

### 1.3 Sign in locally

1. In the **terminal that runs the server**, find the printed table **DEV ACCOUNTS** (ephemeral passwords, new each restart).
2. Open **http://localhost:5000**
3. On **Login**, use one of the emails from that table and the password shown beside it.

### 1.4 If login fails

| Check | Action |
|--------|--------|
| Session errors / instant logout | **`npm run local:secrets-bootstrap`** so `SESSION_SECRET` is ≥32 chars and not a placeholder. |
| DB errors | Confirm **`DATABASE_URL`** host, port, user, password, database name; Postgres must allow TCP connections. |
| `db:push` errors | Fix `DATABASE_URL`, then **`npm run db:push`** again. |
| No dev table printed | Confirm **`NODE_ENV=development`**, and **`DISABLE_DEV_SEED`** is not **`true`**. |

### 1.5 Seeded development accounts (fixed emails, rotating passwords)

These are created/updated on each dev server start by **`server/seed-dev.ts`** (only when **`NODE_ENV === "development"`**).

| Email | Role | Password |
|--------|------|----------|
| `dev@axtask.local` | `user` | Printed in server terminal each start |
| `admin@axtask.local` | `admin` | Printed in server terminal each start |

To disable seeding entirely: set **`DISABLE_DEV_SEED=true`** in `.env`.

### 1.6 Docker Compose alternative

If you use **`npm run docker:up`** instead:

- With **`AXTASK_DOCKER_SEED_DEMO=1`** (default in `.env.docker.example`), the stack seeds **`DOCKER_DEMO_USER_EMAIL`** / **`DOCKER_DEMO_PASSWORD`** and **`docker:up`** prints them.
- Open **http://localhost:5000** and sign in with that pair, or register if demo seed is off.

See **[`../DOCKER_FOUNDATION.md`](../DOCKER_FOUNDATION.md)** and **[`../SIGN_IN.md`](../SIGN_IN.md)**.

---

## 2. Admin UI and API — development vs production

### 2.1 Route

- Client: **`/admin`** (see `client/src/App.tsx`).
- APIs: **`/api/admin/*`** (see `server/routes.ts`).

### 2.2 Development (`NODE_ENV` ≠ `production`)

- You must be signed in as a user with **`role === 'admin'`** (e.g. **`admin@axtask.local`** + password from terminal).
- **Email OTP step-up is not required** for `/api/admin/*` in development. The server only enforces **`adminStepUpExpiresAt`** when **`NODE_ENV === "production"`**.

### 2.3 Production

- Same **`/admin`** route; user must have **`role = 'admin'`** in the database.
- **`POST /api/admin/*`** that use **`requireAdmin`** (not just **`requireAdminRole`**) will return **`403`** with **`ADMIN_MFA_REQUIRED`** until step-up is completed.
- Configure **`RESEND_API_KEY`** and **`RESEND_FROM`** (verified domain) so OTP email can be delivered.
- User completes step-up via the admin UI flow (calls **`POST /api/admin/step-up`** with OTP after **`requireAdminRole`**).

---

## 3. Production — grant admin to a real user

Prerequisite: the person has **already registered** or signed in so a row exists in **`users`**.

### 3.1 SQL (run in your DB console / psql / Neon / Render Shell)

```sql
UPDATE users SET role = 'admin' WHERE email = 'YOUR_REAL_EMAIL';
```

Use the **exact** email stored for that account (case-sensitive per your DB collation).

### 3.2 After granting

1. User signs in at **`https://YOUR_DOMAIN`** (or your production URL).
2. Opens **`/admin`**.
3. In production, completes **email OTP** (Resend) when prompted for step-up.

---

## 4. Environment reminders (production)

- **`RESEND_API_KEY`**, **`RESEND_FROM`** — required for admin step-up email in production.
- **`BASE_URL`**, **`CANONICAL_HOST`** — must match OAuth redirect URIs if using SSO.
- Full Render variable checklist (no secrets): **[`../RENDER_WEB_SERVICE_PASTE_CHECKLIST.md`](../RENDER_WEB_SERVICE_PASTE_CHECKLIST.md)**.
- Generate local Render scaffold: **`npm run render:env-bootstrap`**.

---

## 5. Rotation & incident (short)

| Situation | Action |
|-----------|--------|
| Rotate session signing secret (local `.env`) | **`npm run local:secrets-bootstrap`** |
| Rotate Render env file secrets | **`npm run render:env-bootstrap -- --refresh-secrets-only --force`** then update Render dashboard |
| Compromised OAuth / WorkOS | Rotate credentials in vendor console; update env; verify redirect URIs |
| New production web service | New **`SESSION_SECRET`**, new DB or migrated data, repaste env — see Render checklist |

---

## 6. Private wiki

If this repository is **public**, keep **filled** runbooks (with real emails and hostnames) in a **private** system. Optionally delete **`OPERATOR_RUNBOOK.md`** before pushing if you created it only for scratch notes.

---

## Revision

When `requireAdmin` / step-up / seed logic changes, update this template and your wiki copy.
