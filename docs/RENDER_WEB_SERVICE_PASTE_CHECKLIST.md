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

| Render field | Paste / value |
|----------------|---------------|
| **Name** | `axtask-prod` (or any name you like) |
| **Region** | Choose closest to users |
| **Branch** | `main` (or your deploy branch) |
| **Root Directory** | `.` (repo root) |
| **Runtime** | `Node` |
| **Build Command** | `npm ci && npm run build` |
| **Start Command** | `npm run start` |
| **Health Check Path** | `/ready` |

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

## D. After the first successful deploy

1. **Schema** (once per database):

   ```bash
   DATABASE_URL="YOUR_PROD_URL" npm run db:push
   ```

   (From your PC with prod URL, or **Render Shell** with env already set.)

2. **User sign-in and onboarding:** see **[SIGN_IN.md](./SIGN_IN.md)** for how people open the app and log in (including local Docker and dev server).

3. **Operator access** (database role changes, privileged URLs, production step-up email): use **[`docs/internal/OPERATOR_RUNBOOK.template.md`](./internal/OPERATOR_RUNBOOK.template.md)** (commit-safe) or a gitignored **`docs/internal/OPERATOR_RUNBOOK.md`** / private wiki — see **[`docs/internal/README.md`](./internal/README.md)**.

---

## E. Second domain (e.g. `axtask.dev`)

Create a **second** Web Service (or preview env) with its **own** `CANONICAL_HOST`, `BASE_URL`, `DATABASE_URL` (separate DB recommended), `SESSION_SECRET`, and **duplicate OAuth redirect URIs** for that host in Google/WorkOS.
