# AxTask — Render Web Service: full paste checklist

Use this when creating or editing a **Render → Web Service**. Replace every `YOUR_…` placeholder. **Do not commit real secrets.** This file is meant to live in the repo alongside other operational docs (no secret values); for what belongs in a private wiki vs `docs/`, see [Documentation visibility and planning](./README.md#documentation-visibility-and-planning).

**End-user login** after deploy: [SIGN_IN.md](./SIGN_IN.md). **Operator / privileged access** stays in your internal wiki only.

### What stays in git vs what does not

| In repository (safe) | Never commit |
|----------------------|--------------|
| `tools/render/render-env-bootstrap.mjs`, `.env.render.example`, this checklist | `.env.render` and any file that contains real `DATABASE_URL`, OAuth secrets, `SESSION_SECRET`, `RESEND_API_KEY`, etc. |

The bootstrap script is only **logic**; it does not embed secrets. Generated values live in **gitignored** files (see root `.gitignore`: `.env.render`, backups). That keeps recovery fast: clone the repo, run the generator, paste into a **new** Render service, and rotate credentials at each provider if something was compromised.

**Critical:** Never deploy with a placeholder **`DATABASE_URL`** (e.g. `…@HOST/…` or `USER:PASSWORD` literals). Render will fail at runtime with **`getaddrinfo ENOTFOUND HOST`**. Paste the **Internal Database URL** from your Render PostgreSQL instance (or Neon, etc.) into the `DATABASE_URL` env var.

**Second domain / dev:** Running `render:env-bootstrap` again **overwrites** `.env.render`. Copy the file (or save `SESSION_SECRET` in Render) before generating for **axtask.dev** if you still need the prod scaffold on disk.

### Fast recovery (new web service or rotation)

1. **New app secrets:** `npm run render:env-bootstrap -- --domain=YOUR_HOST --invite --force` (writes `.env.render`; does not print secrets to the terminal).
2. **Rotate only session (and invite if present):** `npm run render:env-bootstrap -- --refresh-secrets-only --force` then copy the new `SESSION_SECRET` into Render → Environment and redeploy.
3. **If an IdP was compromised:** create new OAuth client / WorkOS app keys in that vendor’s dashboard, update Render env, and ensure redirect URIs match `BASE_URL` (see reuse rules below).
4. **Pipe mode:** `npm run render:env-bootstrap -- --stdout --domain=YOUR_HOST > .env.render` — env bytes go to the file; messages and the paste guide go to **stderr** so they are not mixed into `.env.render`. The script **refuses** `--stdout` when stdout is an interactive terminal so values do not land in shell scrollback.

---

## Render UI: two different places (read this once)

Render splits configuration into **(1) Environment** and **(2) Service settings**. Mixing them up causes “I set everything” while health check or schema steps were never done.

### 1) Environment variables

**Path:** your **Web Service** → **Environment** (or **Environment Variables**).

Put **`DATABASE_URL`**, **`SESSION_SECRET`**, **`BASE_URL`**, OAuth keys, Resend, etc. here.

**`DATABASE_URL` is never “Advanced”** — it is always an **environment variable**. For **Neon**: copy the full **Connection string** from the Neon console (**Connection details** for branch `production`, pooling on is fine). For **Render Postgres**: use that instance’s **Internal Database URL**.

### 2) Service settings (not in the Environment list)

**Path:** the **same Web Service** → **Settings** (sidebar or top tabs). Render changes labels over time; use **Find in page** (`Ctrl+F`) and search for **`health`**.

| Setting | Required for AxTask? | Value |
|---------|----------------------|--------|
| **Health Check Path** | **Yes** | **`/ready`** (leading slash). This is **not** an env var named `HEALTH_CHECK` — it is its **own field** on the service. If it is wrong (e.g. `/healthz`), the service may look unhealthy even when the app runs. |

Other toggles (auto-deploy, region, branch) live here too.

### 3) Docker Web Service — “Advanced” panel (if you deploy with **Docker**)

These are **separate** from Environment. For a normal **GitHub → Dockerfile** AxTask deploy:

| Advanced / Docker field | You must fill it? | Notes |
|-------------------------|-------------------|--------|
| **Secret Files** | **No** | Optional; not required for Neon + env vars. |
| **Health Check Path** | **Yes** | Same as above: **`/ready`**. |
| **Registry Credential** | **No** | Only if you pull a **private** image from a registry. Building from this repo → leave default / none. |
| **Docker Build Context Directory** | Usually **`.`** | Repo root. |
| **Dockerfile Path** | **`Dockerfile`** | The **file** name, not `.` alone. |
| **Docker Command** | **No** | Leave empty; use the image `CMD`. |
| **Pre-Deploy Command** | **No** (first go-live) | Does **not** replace the manual **`db:push`** below unless you deliberately script it. |

---

## Mandatory: apply database schema (`db:push`)

**Deploying the web service does not create Postgres tables by default.** The Docker image runs the app; it does not auto-run Drizzle against Neon.

**You must run once** (per empty database / new Neon branch), using the **exact same** `DATABASE_URL` as in Render:

```bash
# From your machine, AxTask repo root:
DATABASE_URL="postgresql://…your Neon or Postgres URL…" npm run db:push
```

**Symptom if skipped:** logs like **`relation "rewards_catalog" does not exist`** (or other `relation "…" does not exist`). That means the DB is reachable but **tables were never created** — fix with **`db:push`**, then restart or redeploy.

**Order that works:** set **`DATABASE_URL`** in Render → deploy → run **`db:push`** with that URL locally (or Render **Shell** if you have tooling there) → confirm app starts without missing-relation errors.

---

## OAuth: not “pick one” — set every provider you use

The app **does not** make you choose a single IdP for the login screen.

- **`getAvailableProviders()`** (server) adds **WorkOS**, **Google**, and **Replit** buttons **whenever** the matching env vars are present. You can set **all three** credential sets on Render at once; users will see every configured option.
- **`AUTH_PROVIDER`** is **optional**. If you **omit** it, the server **auto-picks** a “primary” for metadata only (`workos` → `google` → `replit` → `local`). If you **set** it, that value becomes the primary label; **other providers still appear** as long as their credentials exist.
- **Local email/password** is a separate path in the UI (registration mode permitting). It does not require unsetting Google/WorkOS.

So: **paste all the OAuth env blocks you have configured**; you are not forced to delete WorkOS to use Google.

---

## Parameter map (what to type vs copy vs reuse)

### 1) You **generate** (once per environment)

| Variable | How |
|----------|-----|
| `SESSION_SECRET` | **`npm run render:env-bootstrap`** (writes `.env.render`, does not echo the value) or one-off: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` — must be **≥ 32** characters. Unique per Render service / env. |
| `INVITE_CODE` | (Optional) Use **`npm run render:env-bootstrap -- --invite`** or any strong random string with `REGISTRATION_MODE=invite`. |

### 2) You **copy/paste from a dashboard** (external systems)

| Variable | Where it comes from |
|----------|---------------------|
| `DATABASE_URL` | Render **PostgreSQL** instance → **Internal Database URL**, or **Neon** connection string. Often ends with `?sslmode=require`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud → **APIs & Services** → **Credentials** → OAuth 2.0 Client. |
| `WORKOS_API_KEY` / `WORKOS_CLIENT_ID` | WorkOS dashboard → API Key & Client ID. |
| `WORKOS_REDIRECT_URI` | **You compose** (see “Reuse rules” below); must match WorkOS app settings **exactly**. |
| `REPL_ID` | Replit → your Repl / OIDC app identifier (if using Replit login). |
| `RESEND_API_KEY` | Resend dashboard → API Keys. |
| `RESEND_FROM` | An address/domain **verified in Resend** (e.g. `noreply@yourdomain.com`). |
| `GOOGLE_SHEETS_API_KEY` | (Optional, different product) Google Cloud → API key for Sheets — **not** the same field as OAuth client secret, often a different credential type. |

### 3) You **type from your own domain** (must stay consistent)

| Variable | Rule |
|----------|------|
| `CANONICAL_HOST` | Hostname **only**: `axtask.app` — **no** `https://`. |
| `BASE_URL` | **Must** be `https://` + **same host** as `CANONICAL_HOST`, e.g. `https://axtask.app`. |
| `WORKOS_REDIRECT_URI` | **Must** equal `https://<CANONICAL_HOST>/api/auth/workos/callback` (same host/scheme as `BASE_URL`). |
| Google Console **Authorized redirect URI** | **Must** equal `https://<CANONICAL_HOST>/api/auth/google/callback`. |

### 4) Reuse / “don’t confuse these”

| Item A | Item B | Relationship |
|--------|--------|----------------|
| `CANONICAL_HOST` | `BASE_URL` | Same hostname; `BASE_URL` adds `https://`. |
| `BASE_URL` | OAuth redirect URIs | Redirects are always `BASE_URL` + fixed path (`/api/auth/google/callback`, `/api/auth/workos/callback`). |
| `GOOGLE_CLIENT_*` (login) | `GOOGLE_SHEETS_API_KEY` | **Different** credentials and purposes; both can exist. |
| `DATABASE_URL` | `npm run db:push` | Same string you use locally or in Render Shell to migrate schema. |
| `RESEND_FROM` | `CANONICAL_HOST` | Not enforced in code, but Resend requires a **verified** domain; usually matches your product domain. |
| `AUTH_PROVIDER` | Multiple SSO buttons | **Optional.** Omit for auto-primary, or set one; **all** configured providers still show if env is complete. |

---

## A. Service settings (not in “Environment”)

### A1. Native Node build (if Runtime = Node, not Docker)

| Render field | Paste / value |
|----------------|---------------|
| **Name** | `axtask-prod` (or any name you like) |
| **Region** | Choose closest to users |
| **Branch** | `main` (or your deploy branch) |
| **Root Directory** | `.` (repo root) |
| **Runtime** | `Node` |
| **Build Command** | `npm ci && npm run build` |
| **Start Command** | `npm run start` |
| **Health Check Path** | **`/ready`** |

### A2. Docker build (if Language / Runtime = Docker)

Use the **Docker** row in the **“Advanced / Docker”** table in [Render UI: two different places](#render-ui-two-different-places-read-this-once). **Health Check Path** is still **`/ready`**. Build/start come from the **Dockerfile** (`npm run build` in image, `node dist/index.js` at runtime).

**Plan:** Starter or higher (match `render.yaml` if you use Blueprint).

**Custom domain (after first deploy):** Render dashboard → service → **Custom Domains** → add `axtask.app` (or `axtask.dev`) → set DNS to the **CNAME/A** values Render shows.

---

## B. Environment variables — paste into Render (Key = Value)

Add each row in **Environment → Environment Variables** (or “Add from .env” using a **local** filled file — never commit that file).

### B1. Core (always set on Render)

```
NODE_ENV=production
PORT=5000
FORCE_HTTPS=true
CANONICAL_HOST=YOUR_DOMAIN_NO_SCHEME
BASE_URL=https://YOUR_DOMAIN_NO_SCHEME
DATABASE_URL=YOUR_POSTGRES_URL_WITH_SSLMODE
SESSION_SECRET=YOUR_RANDOM_STRING_AT_LEAST_32_CHARS
```

### B2. Resend (production email)

Set when the deployment sends mail through Resend (transactional email and **privileged step-up flows** in production). Exact flows and operator checklists live in your **internal wiki**, not in this repo.

```
RESEND_API_KEY=YOUR_RESEND_API_KEY
RESEND_FROM=YOUR_VERIFIED_SENDER@YOUR_DOMAIN
```

### B3. Optional: force a “primary” auth label (`AUTH_PROVIDER`)

Omit this line to use **auto-detect** (`workos` → `google` → `replit` → `local`).  
Or set exactly one of: `local` | `google` | `workos` | `replit` — **this does not remove** other SSO buttons when their keys are set.

```
AUTH_PROVIDER=workos
```

### B4. Google sign-in (paste if you use Google — can combine with B5–B6)

```
GOOGLE_CLIENT_ID=YOUR_GOOGLE_OAUTH_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_OAUTH_CLIENT_SECRET
```

**Google Cloud → OAuth client → Authorized redirect URI:**  
`https://YOUR_DOMAIN_NO_SCHEME/api/auth/google/callback`

### B5. WorkOS sign-in (paste if you use WorkOS — can combine with B4 + B6)

```
WORKOS_API_KEY=YOUR_WORKOS_API_KEY
WORKOS_CLIENT_ID=YOUR_WORKOS_CLIENT_ID
WORKOS_REDIRECT_URI=https://YOUR_DOMAIN_NO_SCHEME/api/auth/workos/callback
```

**WorkOS dashboard:** same redirect URI as `WORKOS_REDIRECT_URI`.

### B6. Replit OIDC sign-in (paste if you use Replit login — can combine with B4 + B5)

```
REPL_ID=YOUR_REPL_ID
ISSUER_URL=https://replit.com/oidc
```

(Replit’s OIDC setup must match their current docs; callback routes are registered in the app when `REPL_ID` is set.)

### B7. Optional — registration gate

If you want invite-only signups on prod:

```
REGISTRATION_MODE=invite
INVITE_CODE=YOUR_SHARED_OR_SINGLE_USE_CODE
```

### B8. Optional — Replit fallback host (only if you use it)

```
REPLIT_FALLBACK_HOST=YOUR_OLD_REPLIT_APP_HOST
```

### B9. Optional — Google Sheets integration

```
GOOGLE_SHEETS_API_KEY=YOUR_KEY
```

### B10. Optional — browser push (must be set **before** build if you use Vite-inlined keys)

```
VITE_VAPID_PUBLIC_KEY=YOUR_VAPID_PUBLIC_KEY
VITE_QUERY_PERSIST_BUSTER=v1
```

### B11. Optional — other product flags (see server for `PREMIUM_FLAG_*`)

```
DONATE_URL=
NODEWEAVER_URL=
ATTACHMENT_UPLOAD_SECRET=
```

### B12. Optional — SMS MFA (Twilio)

```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
TWILIO_FROM_NUMBER=
```

---

## C. OAuth consoles — URLs to register (no Render paste)

Add **each** provider you enabled in B4–B6. Paths must match `BASE_URL`:

| Provider | URI to add (same host as `BASE_URL`) |
|----------|--------------------------------------|
| Google | `https://YOUR_DOMAIN/api/auth/google/callback` |
| WorkOS | `https://YOUR_DOMAIN/api/auth/workos/callback` |
| Replit | Follow Replit OIDC docs for callback registration (env `REPL_ID` + `ISSUER_URL`). |

---

## D. After the first deploy (required order)

1. **Schema (mandatory — do not skip)**  
   Run **`npm run db:push`** with **`DATABASE_URL`** equal to Render’s value (Neon connection string or Render Postgres URL). See **[Mandatory: apply database schema](#mandatory-apply-database-schema-dbpush)**.  
   Until this succeeds, you may see **`relation "rewards_catalog" does not exist`** (or similar) in logs.

2. **User sign-in and onboarding:** **[SIGN_IN.md](./SIGN_IN.md)**.

3. **Operator access:** **[`internal/OPERATOR_RUNBOOK.template.md`](./internal/OPERATOR_RUNBOOK.template.md)** / **[`internal/README.md`](./internal/README.md)** / private wiki.

---

## E. Second domain (e.g. `axtask.dev`)

Create a **second** Web Service (or preview env) with its **own** `CANONICAL_HOST`, `BASE_URL`, `DATABASE_URL` (separate DB recommended), `SESSION_SECRET`, and **duplicate OAuth redirect URIs** for that host in Google/WorkOS.
