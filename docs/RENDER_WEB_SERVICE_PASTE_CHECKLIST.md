# AxTask — Render Web Service: full paste checklist

Use this when creating or editing a **Render → Web Service**. Replace every `YOUR_…` placeholder. **Do not commit real secrets.** This file is meant to live in the repo alongside other operational docs (no secret values); for what belongs in a private wiki vs `docs/`, see [Documentation visibility and planning](./README.md#documentation-visibility-and-planning).

**End-user login** after deploy: [SIGN_IN.md](./SIGN_IN.md). **Operator / privileged access** stays in your internal wiki only.

### Render: where to click (sidebar — do this first)

On a **Web Service** (e.g. AxTask), Render puts things in **different left-sidebar sections**. This is the #1 source of confusion.

| What you need | Click in the **left sidebar** (labels as of 2025–2026) |
|---------------|--------------------------------------------------------|
| **`DATABASE_URL`**, `SESSION_SECRET`, all **Environment Variables** | **Manage → Environment** (same page as “Secret Files” / “Add variable”). |
| **Health Check Path** (`/ready`), Docker build path, region, branch, custom domain (service-level) | **Events → Settings** — **not** under Manage → Environment. |
| Deploy logs | **Monitor → Logs** |

**Do not** use the browser Find box (`Ctrl+F`) on the **Environment** page to search for **`dashboard`** — that string is not on that page, so you will get **0/0** matches and think the docs are wrong. **Open `Settings` first** (sidebar), *then* `Ctrl+F` → type **`health`** to jump to **Health Check Path**.

**Neon:** If the branch compute shows **SUSPENDED**, wake/resume it (Connect / SQL Editor / Edit compute) or connections from Render can fail until Postgres is active.

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

Same idea as the **Render: where to click** table at the **top** of this doc: **Manage → Environment** vs **Events → Settings**. Mixing them up causes “I set everything” while health check or schema steps were never done.

### 1) Environment variables

**Path:** **Manage → Environment** on your Web Service.

Put **`DATABASE_URL`**, **`SESSION_SECRET`**, **`BASE_URL`**, OAuth keys, Resend, etc. here.

**`DATABASE_URL` is never “Advanced”** — it is always an **environment variable**. For **Neon**: copy the full **Connection string** from the Neon console (**Connection details** for branch `production`, pooling on is fine). For **Render Postgres**: use that instance’s **Internal Database URL**.

### 2) Service settings (not in the Environment list)

**Path:** **Events → Settings** (left sidebar on the Web Service). **Only after this page is open**, use `Ctrl+F` → **`health`**.

| Setting | Required for AxTask? | Value |
|---------|----------------------|--------|
| **Health Check Path** | **Yes** (when the field exists) | **`/ready`** (leading slash). This is **not** an env var named `HEALTH_CHECK` — it is its **own field**. If it is wrong (e.g. `/healthz`), the service may look unhealthy even when the app runs. On some **Free** tiers the field may be absent; the app can still run — fix **`DATABASE_URL`** and **`db:push`** first. |

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
| **Pre-Deploy Command** | **No** (first go-live) | **`npm run start`** already runs **`drizzle-kit push`** before `node dist/index.js` (unless **`SKIP_DB_PUSH_ON_START=true`**). You do not need a separate pre-deploy migrate unless you prefer that model. |

---

## Database schema (`db:push`)

**Default:** The production **`start`** script runs **`npm run db:push`** automatically on each process start (same `DATABASE_URL` as Render). That creates/updates tables for an empty Neon branch or new Postgres without a separate manual step.

**Optional manual push** (troubleshooting or CI): from your machine with the **same** `DATABASE_URL` as Render:

```bash
DATABASE_URL="postgresql://…your Neon or Postgres URL…" npm run db:push
```

**Symptom if schema is missing:** logs like **`relation "rewards_catalog" does not exist`**. Typical causes: **`DATABASE_URL`** wrong/unset at runtime, **`SKIP_DB_PUSH_ON_START=true`** set by mistake, or **`db:push`** failed (check deploy logs for `[axtask:start]` / Drizzle errors).

**Order that works:** set **`DATABASE_URL`** in Render → deploy → confirm logs show a successful schema push on boot → **`/ready`** should pass once the app is listening.

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
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio Console → **Account** → **API keys & tokens** (or **Account Info** on older UI) — **not** from Render. |
| `TWILIO_MESSAGING_SERVICE_SID` | Twilio → **Messaging** → **Services** → create/open a service → **Messaging Service SID** (starts with `MG`). |
| `TWILIO_FROM_NUMBER` | Twilio → **Phone Numbers** → **Manage** → **Active numbers** → choose a number → copy **E.164** (e.g. `+15551234567`). Use this **or** a Messaging Service SID, not both required. |
| `GOOGLE_SHEETS_API_KEY` | (Optional, different product) Google Cloud → API key for Sheets — **not** the same field as OAuth client secret, often a different credential type. |

### 3) You **type from your own domain** (must stay consistent)

| Variable | Rule |
|----------|------|
| `CANONICAL_HOST` | Hostname **only**: `axtask.app` — **no** `https://`. |
| `BASE_URL` | **Must** be `https://` + **same host** as `CANONICAL_HOST`, e.g. `https://axtask.app`. |
| `WORKOS_REDIRECT_URI` | **Must** equal `https://<CANONICAL_HOST>/api/auth/callback` (same host/scheme as `BASE_URL`; WorkOS callback route in this app). |
| Google Console **Authorized redirect URI** | **Must** equal `https://<CANONICAL_HOST>/api/auth/google/callback`. |

### 4) Reuse / “don’t confuse these”

| Item A | Item B | Relationship |
|--------|--------|----------------|
| `CANONICAL_HOST` | `BASE_URL` | Same hostname; `BASE_URL` adds `https://`. |
| `BASE_URL` | OAuth redirect URIs | Google: `BASE_URL` + `/api/auth/google/callback`. WorkOS: set `WORKOS_REDIRECT_URI` to `BASE_URL` + `/api/auth/callback`. |
| `GOOGLE_CLIENT_*` (login) | `GOOGLE_SHEETS_API_KEY` | **Different** credentials and purposes; both can exist. |
| `DATABASE_URL` | `npm run db:push` | Same string you use locally or in Render Shell to migrate schema. |
| `RESEND_FROM` | `CANONICAL_HOST` | Not enforced in code, but Resend requires a **verified** domain; usually matches your product domain. |
| **Render** (hosting) | **Resend** (email SaaS) | Different companies. Mail uses **`RESEND_*`** env vars on Render — not a “Render email API key.” |
| **Render** “API keys” / dashboard tokens | **Twilio** or **Resend** | **No.** Render’s own API keys are for **automating Render** (REST API, Blueprints). They **cannot** send SMS or transactional email. OTP/MFA needs credentials **from Twilio** (SMS) and **from Resend** (email), pasted as env vars on your Web Service. |
| One **Twilio** project | Staging + production | **You may reuse** the same `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` on multiple Render services if policy allows. Prefer **separate Twilio subaccounts** or **Messaging Services** per environment for isolation. You do **not** create “another Render key” for Twilio — you create/use credentials in **Twilio Console**. |
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

### MFA / OTP delivery — two layers (operator order)

| Layer | What | Required for production email codes? | When to add |
|-------|------|--------------------------------------|-------------|
| **1 — Email (Resend)** | Transactional email for OTP / MFA | **Yes**, if you use **email** step-up (billing, shares, etc.) | **First.** Finish domain verification and `RESEND_*` before worrying about SMS. |
| **2 — SMS (Twilio)** | Text message OTP / phone verify | **No.** Optional add-on | **Later**, when you want SMS billing codes or **Account → verify phone** in production. |

You can ship with **only Layer 1**: users choose **email** for billing MFA and all flows that support it. **Layer 2** does not block Layer 1. If Twilio env vars are unset, **SMS** challenges return **503** until configured; **email** still works when Resend is set.

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

### B2. Layer 1 — Resend (production email MFA) — **configure this first**

**Where in Render:** exactly the same place as `DATABASE_URL` — **Web Service → Manage → Environment**. Add or edit **two rows** (two separate keys). This has nothing to do with “Render API keys”; **Resend** (resend.com) issues the mail key.

| Key | What it is | Where the value comes from |
|-----|------------|----------------------------|
| **`RESEND_API_KEY`** | **One** secret API key per Resend account (starts with `re_`). You do **not** need multiple Resend API keys for AxTask unless you intentionally use separate Resend projects. | Resend dashboard → **API Keys** → create/copy. When you rotate, paste the **new** key here only. |
| **`RESEND_FROM`** | **Not** an API key. The **From** header (display name + address). The **domain** (or single sender) must be **verified in Resend** or sends fail. | After domain verification (steps below), e.g. `AxTask <no-reply@notifications.yourdomain.com>`. |

#### Where to verify `RESEND_FROM` in Resend (domain / DNS)

1. Log in to **[resend.com](https://resend.com)** → **Domains** (sidebar).
2. **Add domain** — enter the domain you will send from (e.g. `notifications.yourdomain.com` or your apex domain).
3. Resend shows **DNS records** (often `TXT` for SPF, `MX` / `CNAME` for DKIM, etc.). Add them at your **DNS host** (registrar, Cloudflare, etc.). Wait for Resend to show **Verified** (can take a few minutes to 48h depending on DNS).
4. Use an address on that domain in **`RESEND_FROM`**, e.g. `AxTask <no-reply@notifications.yourdomain.com>`. The local part (`no-reply`, `noreply`, etc.) can be any mailbox name; deliverability is about the **verified domain**, not a separate “email service” product inside Resend beyond **Domains** + **API Keys**.
5. Paste **`RESEND_API_KEY`** and **`RESEND_FROM`** into Render → redeploy.

**Sandbox / testing:** Resend may allow sending only to **your own** verified addresses until the domain is fully verified — check Resend’s current dashboard messaging.

```
RESEND_API_KEY=re_xxxxxxxx
RESEND_FROM=AxTask <no-reply@notifications.YOUR_VERIFIED_DOMAIN>
```

**Subdomain vs “contact” page:** The **mail subdomain** is only for **DNS + Resend** — you do **not** need a separate Render service or a public URL on `mail.…` for email to work. If you want a **public** URL such as `https://contact.yourdomain.com` that shows the same app (e.g. the in-app **`/contact`** page), add **`contact`** as a **custom domain** on the **same** Render Web Service and point a **CNAME** at Render in Porkbun (same flow as `www` / apex). Then set **`ADDITIONAL_ALLOWED_HOSTS=contact.yourdomain.com`** (and **`ADDITIONAL_ALLOWED_ORIGINS=https://contact.yourdomain.com`** if browser calls ever hit that host) so host allowlisting does not redirect that hostname away.

After changing either value: **Save, rebuild, and deploy** on the Web Service.

**Production OTP behavior:** With `NODE_ENV=production`, **email** MFA requires **`RESEND_API_KEY`** (and a verified **`RESEND_FROM`** is strongly recommended). If Resend is missing, the API returns **503** with a clear message — that is **not** fixed by Render dashboard “API keys.” See **`server/services/otp-delivery.ts`** (`canDeliverMfaInProduction`).

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
WORKOS_REDIRECT_URI=https://YOUR_DOMAIN_NO_SCHEME/api/auth/callback
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

### B10. Optional — browser push

**Default:** With `CANONICAL_HOST` / `BASE_URL` / `VAPID_SUBJECT` already set elsewhere in this checklist, the app **auto-provisions** a VAPID keypair in the database on boot and serves the public key at `/api/notifications/push-public-config` — you do **not** need `npx web-push` or `VITE_VAPID_PUBLIC_KEY` unless you want the key inlined at build time.

**Bring your own keys:** set **both** public and private before build/runtime (and keep them matched):

```
VITE_VAPID_PUBLIC_KEY=YOUR_VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY=YOUR_VAPID_PRIVATE_KEY
VAPID_SUBJECT=mailto:you@yourdomain.com
VITE_QUERY_PERSIST_BUSTER=v1
```

Optional: `VAPID_PUBLIC_KEY` (Node-only public override). Optional: `DISABLE_PUSH_DISPATCH=true`, `PUSH_DISPATCH_INTERVAL_MS` (default `120000`, min `60000`).

### B11. Optional — other product flags (see server for `PREMIUM_FLAG_*`)

```
DONATE_URL=
NODEWEAVER_URL=
ATTACHMENT_UPLOAD_SECRET=
```

### B12. Layer 2 — SMS MFA (Twilio) — **optional; add when ready**

**Not required** if you only use **email** OTP (Layer 1 / Resend). Add this block when you want **SMS** billing codes or production **phone verification** on the Account page.

**You cannot use “Render API keys” here.** Render only **stores** these strings as environment variables. The values come **100% from [Twilio](https://www.twilio.com)** (same pattern as Resend for email).

| Question | Answer |
|----------|--------|
| Do I need a **new** Twilio account for AxTask? | **No** — use an **existing** Twilio project if you already have one. Create **one** pair SID + Auth Token per account (rotate in Twilio if compromised). |
| Do I need a **second** Twilio credential for Render vs local? | **Optional.** Same SID/token on staging and prod works but couples environments; use **subaccounts** in Twilio if you want hard separation. |
| What do I paste into Render? | Exactly the variable **names** below; **values** are copied from Twilio Console (never invent placeholders). |

#### Step 1 — Account SID and Auth Token

1. Log in to **[Twilio Console](https://console.twilio.com/)**.
2. On the **Account Dashboard** (home), find **Account Info**:
   - **Account SID** — copy into Render as **`TWILIO_ACCOUNT_SID`** (starts with `AC`).
   - **Auth Token** — click to reveal → copy into **`TWILIO_AUTH_TOKEN`**.  
     Treat it like a password. If you **regenerate** the token in Twilio, update Render immediately or SMS will fail with **502** from Twilio.

#### Step 2 — Either a Messaging Service **or** a From number (one is enough)

AxTask’s server requires **at least one** of:

- **`TWILIO_MESSAGING_SERVICE_SID`** (recommended for production), **or**
- **`TWILIO_FROM_NUMBER`**

**Option A — Messaging Service (recommended)**

1. Twilio Console → **Messaging** → **Services** → **Create messaging service** (e.g. name `AxTask MFA`).
2. Add **Sender Pool**: add your **Twilio phone number** (or short code / toll-free as allowed on your account).
3. Complete any compliance / A2P registration steps Twilio requires for your country and use case (US A2P 10DLC, etc.) — without this, sends may fail.
4. Open the service → copy **Messaging Service SID** (starts with `MG`) → Render: **`TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxx`**
5. Leave **`TWILIO_FROM_NUMBER`** empty if the Messaging Service owns the senders.

**Option B — From number only (simpler, smaller scale)**

1. Twilio Console → **Phone Numbers** → **Manage** → **Buy a number** (or use a trial number — trial can only SMS **verified** destination numbers).
2. Copy the number in **E.164** format, e.g. `+15551234567`.
3. Render: **`TWILIO_FROM_NUMBER=+15551234567`**
4. Leave **`TWILIO_MESSAGING_SERVICE_SID`** empty.

**Do not set both** to conflicting values unless you know you need both; the code uses **Messaging Service SID if set**, else **From number** (`server/services/otp-delivery.ts`).

#### Step 3 — Paste into Render

**Web Service → Manage → Environment** — add four rows (omit unused optional column):

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

*or* (if not using a Messaging Service):

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM_NUMBER=+15551234567
```

Save → **Manual Deploy** or wait for auto-deploy. Test SMS MFA from the app; if Twilio rejects the request, logs show a **502** with Twilio’s error text (different from **503** “not configured”).

#### Troubleshooting quick reference

| HTTP / symptom | Meaning |
|----------------|---------|
| **503** “SMS OTP is not configured…” | Production + missing **`TWILIO_ACCOUNT_SID`**, **`TWILIO_AUTH_TOKEN`**, or **neither** `TWILIO_MESSAGING_SERVICE_SID` **nor** `TWILIO_FROM_NUMBER`. |
| **502** with Twilio message | Credentials set, but Twilio API failed (invalid token, unverified trial recipient, A2P block, etc.). Fix in Twilio Console / logs. |
| Email works, SMS does not | Expected if **Layer 2** (Twilio) is unset. Email = **Resend** only; SMS = **Twilio** only — add B12 when ready. |

---

## C. OAuth consoles — URLs to register (no Render paste)

Add **each** provider you enabled in B4–B6. Paths must match `BASE_URL`:

| Provider | URI to add (same host as `BASE_URL`) |
|----------|--------------------------------------|
| Google | `https://YOUR_DOMAIN/api/auth/google/callback` |
| WorkOS | `https://YOUR_DOMAIN/api/auth/callback` |
| Replit | Follow Replit OIDC docs for callback registration (env `REPL_ID` + `ISSUER_URL`). |

---

## D. After the first deploy (required order)

1. **Schema**  
   Normally applied automatically when the web service starts (**`npm run start`** → `drizzle-kit push`). If logs show missing-relation errors, fix **`DATABASE_URL`**, remove **`SKIP_DB_PUSH_ON_START`** if set, or run **`npm run db:push`** manually with Render’s URL. See **[Database schema (`db:push`)](#database-schema-dbpush)**.

2. **User sign-in and onboarding:** **[SIGN_IN.md](./SIGN_IN.md)**.

3. **Operator access:** **[`internal/OPERATOR_RUNBOOK.template.md`](./internal/OPERATOR_RUNBOOK.template.md)** / **[`internal/README.md`](./internal/README.md)** / private wiki.

---

## E. Second domain (e.g. `axtask.dev`)

### E1. Same Render Web Service (alias domain)

Use this when **one deployment** should answer on both hostnames (e.g. `axtask.app` and `axtask.dev`).

1. Render → your Web Service → **Custom Domains** → add `axtask.dev` (and `www` if you use it) → point DNS at the records Render shows.
2. Keep **`CANONICAL_HOST`** and **`BASE_URL`** on your **primary** host (e.g. `axtask.app` / `https://axtask.app`).
3. Set **`ADDITIONAL_ALLOWED_HOSTS=axtask.dev`** (comma-separated if you add more). Set **`ADDITIONAL_ALLOWED_ORIGINS=https://axtask.dev`** so API writes from that origin are allowed.

**OAuth caveat:** `WORKOS_REDIRECT_URI` is a **single** URL. WorkOS always sends users back to that host after login (see `server/auth-providers.ts`). People who start on `axtask.dev` may finish on your primary domain after WorkOS; session cookies are per-host, so treat the extra domain as an **alias** (bookmark/marketing) or make the domain in `WORKOS_REDIRECT_URI` / `BASE_URL` your main entry point. Google can list **both** redirect URIs in Cloud Console; if you do **not** set `GOOGLE_REDIRECT_URI`, the app uses the request host for Google’s `redirect_uri`.

### E2. Separate environment (staging / true second product URL)

Create a **second** Web Service (or preview env) with its **own** `CANONICAL_HOST`, `BASE_URL`, `DATABASE_URL` (separate DB recommended), `SESSION_SECRET`, and **OAuth redirect URIs** registered for **that** host in Google/WorkOS (`WORKOS_REDIRECT_URI` must match the callback path: `https://<that-host>/api/auth/callback`).
