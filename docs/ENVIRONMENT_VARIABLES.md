# Environment variables reference

This document **groups and explains** the environment variables AxTask uses. It complements [`.env.example`](../.env.example) (local template), [`.env.docker.example`](../.env.docker.example) (Compose), [`.env.production.example`](../.env.production.example) (general production contract), and [`.env.render.example`](../.env.render.example) (Render overlay + bootstrap source).

**Cross-check templates vs code (key names only):** `npm run env:audit` — prints which `.env*` files, [`render.yaml`](../render.yaml), this doc, and the codebase reference each key. Use `npm run env:audit:strict` in CI or before release to fail when the production contract keys are missing from templates or the Render manifest.

**Not a machine-complete inventory.** New code may add variables before this file is updated. To audit what the repo references today, search from the project root, for example:

- Server: `rg "process\\.env\\.\\w+" server -g "*.ts"`
- Client (Vite): `rg "import\\.meta\\.env\\.\\w+" client -g "*.{ts,tsx}"`
- Scripts: `rg "process\\.env\\.\\w+" scripts -g "*.{mjs,js}"`

**Security:** Never commit real secrets. Generate AxTask-owned secrets with `npm run env:secrets:generate`, then store them in your password manager and deployment host. The operator checklist is [`docs/ENV_SECRET_CHECKLIST.md`](ENV_SECRET_CHECKLIST.md). Production and Render workflows are covered in [`.cursor/rules/render-env-automation.mdc`](../.cursor/rules/render-env-automation.mdc) and related tooling.

## Env-file map

| File | Committed? | Role |
|------|------------|------|
| [`.env.example`](../.env.example) | Yes | Local dev template (`npm run local:env-init` → `.env`). |
| [`.env.docker.example`](../.env.docker.example) | Yes | Compose template (`npm run docker:env-init` → `.env.docker`). |
| [`.env.production.example`](../.env.production.example) | Yes | **General** production contract (any host); operators paste into the dashboard or a private `.env`. |
| [`.env.render.example`](../.env.render.example) | Yes | **Render-specific** overlay; source for `npm run render:env-bootstrap` (writes gitignored `.env.render`). Inherits the same key set as `.env.production.example` plus Render-oriented comments. |
| [`render.yaml`](../render.yaml) `envVars` | Yes | Declares which keys exist on Render (`sync: false` = value from dashboard). |
| `.env`, `.env.docker`, `.env.render` | No (gitignored) | Runtime copies on a machine; never commit. |

Production startup runs [`scripts/deploy/check-env.mjs`](../scripts/deploy/check-env.mjs) via [`scripts/production-start.mjs`](../scripts/production-start.mjs) (`npm run start`) with `--prod`, so missing required keys fail before migrations.

## Conventions

| Pattern | Where it applies | Notes |
|--------|------------------|--------|
| `DATABASE_URL` | Node, Drizzle, DB scripts | **Only** this name is read for PostgreSQL. See [DEV_DATABASE_AND_SCHEMA.md](DEV_DATABASE_AND_SCHEMA.md#app-settings-vs-database_url-important) — app settings and DB URL are **different keys** in the same `.env`, not one merged value. |
| `VITE_*` | Vite **build** (client) | Baked into the static bundle at `npm run build` time. Changing them requires a **rebuild and redeploy** to affect the browser. |
| `process.env.*` (no `VITE_`) | Node server, `tsx`, most `scripts/*.mjs` | Read at **runtime** (or when that script runs). `dotenv` is loaded by some entrypoints (e.g. `npm run db:push`); others require `-r dotenv/config` or a pre-set environment — see [DEV_DATABASE_AND_SCHEMA.md](DEV_DATABASE_AND_SCHEMA.md). |

---

## 1. Core process and HTTP

| Variable | Required | Purpose |
|----------|----------|---------|
| `NODE_ENV` | Usual | `development` / `production` / `test`. Gates strict checks, error detail, and several defaults. |
| `PORT` | No | HTTP listen port. Default `5000`. |
| `CANONICAL_HOST` | No | Hostname for redirects / allowlists in production. |
| `FORCE_HTTPS` | No | When not `"false"`, treat requests as HTTPS for cookies / redirects. |
| `REPLIT_FALLBACK_HOST` | No | Replit legacy fallback; default in code if unset. |
| `ADDITIONAL_ALLOWED_HOSTS` | No | Comma-separated extra Host headers allowed. |
| `ADDITIONAL_ALLOWED_ORIGINS` | No | Comma-separated CORS-style origins. |
| `BASE_URL` | No | Public app URL (OAuth, Google Sheets, smoke tests). Often set on hosts. |

---

## 2. Database

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | **Yes** (for any DB use) | Single PostgreSQL connection string. **Neon:** host like `ep-….neon.tech`, usually with `?sslmode=require`. **Local:** e.g. `localhost:5432`. |

**Related (scripts / deploy):** `AXTASK_DB_SIZE_BUDGET_BYTES`, `AXTASK_DB_CAPACITY_JSON`, `AXTASK_DB_CAPACITY_ACK`, `AXTASK_SKIP_DB_CAPACITY_CHECK` (see [scripts/deploy/check-db-capacity.mjs](../scripts/deploy/check-db-capacity.mjs)), `SKIP_SCHEMA`, `RUN_TESTS` (migration checks), `RUN_PG_SCHEMA_TESTS` (integration tests).

---

## 3. Session, cookies, and upload signing

| Variable | Required | Purpose |
|----------|----------|---------|
| `SESSION_SECRET` | **Yes** (prod) | Signs sessions; must be long random. |
| `AUTH_AUDIT_PEPPER` | **Yes** (prod) | Pepper for auth/security audit hashing; length ≥ 20. Validated by [`scripts/deploy/check-env.mjs`](../scripts/deploy/check-env.mjs). |
| `SESSION_MAX_AGE_MS` | No | Session cookie `maxAge` and CSRF cookie lifetime (integer ms). Default **604800000** (7 days). Min **300000** (5 min), max **34560000000** (~400 days). Shorter values reduce impact of a copied cookie; tune with UX (login frequency). See [SESSION_THREAT_MODEL.md](SESSION_THREAT_MODEL.md). |
| `DEV_SESSION_MEMORY_STORE` | No | Dev-only in-memory sessions when Postgres is down. |
| `TOTP_ENCRYPTION_KEY` | **Yes** (prod) | Exactly **64** hexadecimal characters (32 bytes); encrypts TOTP secrets at rest. Validated by [`scripts/deploy/check-env.mjs`](../scripts/deploy/check-env.mjs). |
| `ATTACHMENT_UPLOAD_SECRET` | No | HMAC for upload tokens; falls back to `SESSION_SECRET` or dev default. |
| `DISABLE_DEV_SEED` | No | Skips dev account seed. |

---

## 4. Web Push (VAPID)

Web Push needs a **key pair** plus a **contact subject** and a **client-visible public key** (Vite). These are **not** related to PostgreSQL/Neon; they only enable push subscription and dispatch.

| Variable | Server / client | When required | Notes |
|----------|-----------------|---------------|--------|
| `VAPID_PUBLIC_KEY` | Server runtime | For signing/dispatch and `/api/notifications/*` | Authoritative public key. |
| `VAPID_PRIVATE_KEY` | Server runtime | **Secret** | Never expose to the browser or client bundle. |
| `VAPID_SUBJECT` | Server runtime | Optional | `mailto:` or `https:` contact; default in code. |
| `VITE_VAPID_PUBLIC_KEY` | **Client build** | Strongly recommended | Must equal `VAPID_PUBLIC_KEY`. Injected at **`npm run build`** so the SPA can subscribe without an extra round-trip. |

**Deploy rule:** If **any** of `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, or `VITE_VAPID_PUBLIC_KEY` is set in production, **all three** must be set (see `check-env.mjs`). Leave all three unset if you are not using push yet.

**Provisioning:** `npm run vapid:generate` ([`scripts/generate-vapid-keys.mjs`](../scripts/generate-vapid-keys.mjs)) prints **four** lines. Copy **all four** into:

- **Local dev:** your root `.env` (and rebuild the client after changing `VITE_*`).
- **Render / other hosts:** the service environment; ensure **`VITE_VAPID_PUBLIC_KEY` is set before `npm run build`** in the build pipeline (Render “build” step env).

**If you “have the keys on the host but not in the repo”:** that is correct — secrets stay in the host dashboard. Pull them into a **local** `.env` only for local builds/tests; do not commit. After updating VAPID on the host, **redeploy** so a new build picks up `VITE_VAPID_PUBLIC_KEY` if the build runs on the host.

**Deep dive:** [NOTIFICATIONS_AND_PUSH.md](NOTIFICATIONS_AND_PUSH.md).

---

## 5. Auth providers (Google, WorkOS, Replit)

| Variable | Purpose |
|----------|---------|
| `AUTH_PROVIDER` | Explicit `workos` / `google` / `replit` (see [`server/auth-providers.ts`](../server/auth-providers.ts)). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google OAuth. |
| `GOOGLE_SHEETS_API_KEY`, `GOOGLE_ACCESS_TOKEN`, `GOOGLE_REFRESH_TOKEN` | Sheets integration / corporate flows. |
| `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_REDIRECT_URI` | WorkOS. |
| `ISSUER_URL` | OIDC issuer (Replit). |
| `REPL_ID` | Replit app id. |
| `REGISTRATION_MODE` | See [Registration gate and invite mode](#registration-gate-and-invite-mode) below. |
| `INVITE_CODE` | Shared secret when `REGISTRATION_MODE=invite` (including the production default when mode is unset). |

### Registration gate and invite mode

- **`REGISTRATION_MODE`** supports `open`, `invite`, or `closed` (case-insensitive; surrounding whitespace is trimmed). Any other value logs a warning and falls back to **`invite`** when `NODE_ENV=production`, else **`open`** (see [`server/registration-config.ts`](../server/registration-config.ts)).
- When effective mode is **`invite`**, **`INVITE_CODE`** must be set on the server to a non-empty value **at least 8 characters** after trim. If it is missing, **`POST /api/auth/register`** returns *Signup is temporarily unavailable…* and the SPA disables account creation once `/api/auth/config` reports `inviteConfigured: false`.
- **Production default:** If `REGISTRATION_MODE` is **unset** and `NODE_ENV=production`, the server behaves as **`invite`**. That means an empty `INVITE_CODE` blocks **all** email/password signups until you set `REGISTRATION_MODE=open` or provide a real invite code — this is the failure mode that looks like “the server is down” but is only configuration.
- **OAuth bypass:** Google, WorkOS, and Replit callbacks still create users via [`findOrCreateOAuthUser`](../server/auth-providers.ts) and **do not** consult `REGISTRATION_MODE`. Invite-only applies to **local** email/password registration, not to SSO provisioning.

---

## 6. Registration, premium flags, and operator policy

| Variable | Purpose |
|----------|---------|
| `PREMIUM_FLAG_*` | Feature gates (`SAVED_VIEWS`, `REVIEW_WORKFLOWS`, `WEEKLY_DIGEST`, etc. — see [`server/routes.ts`](../server/routes.ts) `premiumFeatureMatrix`). |
| `OWNER_COIN_GRANT_USER_IDS` | Comma-separated user ids; see [OPERATOR_COIN_GRANTS.md](OPERATOR_COIN_GRANTS.md). |
| `ARCHETYPE_READ_TOKEN` | Read archetype analytics without admin session. |

---

## 7. AI classification, assistant, and NodeWeaver

| Variable | Purpose |
|----------|---------|
| `UNIVERSAL_CLASSIFIER_API_URL` | Optional external classifier HTTP base URL. |
| `UNIVERSAL_CLASSIFIER_API_KEY` | Optional Bearer token for that API. |
| `NODEWEAVER_URL` | **Required** for NodeWeaver path in [`universal-classifier.ts`](../server/services/classification/universal-classifier.ts) when that integration is used. |
| `AI_EXTERNAL_CLASSIFIER_ENABLED` | Default on unless `"false"`. |
| `OPENAI_API_KEY` | Required for `/api/ai/interpret` and `/api/ai/execute` when a prompt is not handled by deterministic parsing. |
| `OPENAI_MODEL` | Optional model override for assistant parsing (default: `gpt-4o-mini`). |
| `OPENAI_BASE_URL` | Optional OpenAI-compatible base URL override (default: `https://api.openai.com/v1`). |

See [NODEWEAVER.md](NODEWEAVER.md), [RAG_CLASSIFICATION_BLUEPRINT.md](RAG_CLASSIFICATION_BLUEPRINT.md).

---

## 8. Storage and attachments

| Variable | Purpose |
|----------|---------|
| `ATTACHMENT_STORAGE_DIR` | Filesystem root for stored attachments (see [`attachment-storage.ts`](../server/services/attachment-storage.ts)). |
| `STORAGE_MAX_TASKS`, `STORAGE_MAX_ATTACHMENT_BYTES`, `STORAGE_MAX_ATTACHMENT_COUNT`, `STORAGE_MAX_TASK_RETENTION_DAYS`, `STORAGE_SOFT_WARNING_PERCENT` | Defaults in [`server/storage.ts`](../server/storage.ts) storage policy. |

---

## 9. Adherence and background jobs

Full matrix: [SCHEDULED_RESOURCE_CONTROLS.md](SCHEDULED_RESOURCE_CONTROLS.md).

| Variable | Purpose |
|----------|---------|
| `ADHERENCE_INTERVENTIONS_ENABLED` | `"true"` to enable adherence cron. |
| `VAPID_*` | Required for real push delivery (see section 4). |
| `DISABLE_REMINDER_DISPATCH` | `"true"` disables 60s reminder dispatch ticker. |
| `REMINDER_DISPATCH_INTERVAL_MS`, `REMINDER_DISPATCH_MAX_PER_TICK` | Reminder dispatch tuning (defaults 60s / 100). |
| `DISABLE_ARCHETYPE_ROLLUP`, `ARCHETYPE_ROLLUP_INTERVAL_MS` | Archetype rollup worker (default interval 1h). |
| `DISABLE_RETENTION_PRUNE`, `RETENTION_PRUNE_INTERVAL_MS`, `RETENTION_PRUNE_INITIAL_DELAY_MS` | In-process retention prune (default 24h, 2m boot delay). |
| `DISABLE_DB_SIZE_SNAPSHOT` | `"true"` skips daily `db_size_snapshots` write; retention prune still runs. |
| `DISABLE_OPS_SNAPSHOT` | `"true"` blocks admin usage capture and (after PR #68) ops stdout snapshot ticker. |
| `OPS_SNAPSHOT_INTERVAL_MS`, `OPS_SNAPSHOT_INITIAL_DELAY_MS` | Ops stdout snapshot cadence (PR #68). |
| `DISABLE_DB_RETENTION_CRON` | `"true"` skips Render/manual `scripts/db-retention.mjs` run (exit 0). |
| `BACKUP_SCHEDULER_ENABLED`, `BACKUP_SCHEDULER_INTERVAL_MS`, `BACKUP_SCHEDULER_BATCH_SIZE`, `BACKUP_SCHEDULER_CONCURRENCY` | Opt-in tick scheduler — see [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md). |
| `BACKUP_QUEUE_WORKER_ENABLED`, `BACKUP_QUEUE_WORKER_POLL_MS`, `BACKUP_QUEUE_WORKER_CONCURRENCY` | Opt-in PG queue worker. |
| `BACKUP_BULLMQ_ENABLED`, `BACKUP_BULLMQ_CONCURRENCY` | Opt-in Redis BullMQ worker. |
| `AXTASK_ARCHETYPE_POLL_SCHEDULER` | Set `0` to disable poll auto-schedule. |

---

## 10. Admin monitoring and alerts

| Variable | Purpose |
|----------|---------|
| `ADMIN_ALERT_MODE` | e.g. `off` / `production`. |
| `ADMIN_ALERT_EMAILS` | Comma-separated. |
| `RESEND_API_KEY`, `RESEND_FROM` | Email delivery (also OTP/admin). |
| `ADMIN_ALERT_WEBHOOK_URL` | Optional webhook. |
| `ADMIN_ALERT_DEDUPE_TTL_MS` | Dedupe window. |
| `SECURITY_API_REQUEST_LOGGING` | `false` by default. Set `true` only for temporary route-attribution diagnostics. Normal production keeps meaningful security events and 5xx `api_error` events, but does not store one `api_request` row per normal API response. See [`server/routes.ts`](../server/routes.ts) `/api` observation middleware. |
| `ENABLE_FOUNDRY` | Set to `"true"` in production to expose admin-only Foundry routes (`/api/admin/foundry/*`). In non-production it is implicitly enabled. |

---

## 11. Email and SMS (OTP, production)

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY`, `RESEND_FROM` | Resend (email). |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER` | SMS. |

See [`server/services/otp-delivery.ts`](../server/services/otp-delivery.ts).

---

## 12. Archetype empathy analytics

| Variable | Purpose |
|----------|---------|
| `ARCHETYPE_ANALYTICS_SALT` | **Required in production** (≥16 chars). |
| `ARCHETYPE_READ_TOKEN` | Optional read token. |

[ARCHETYPE_EMPATHY_ANALYTICS.md](ARCHETYPE_EMPATHY_ANALYTICS.md).

---

## 13. Productivity export pricing (AxCoin / gates)

| Variable | Purpose |
|----------|---------|
| `PRODUCTIVITY_EXPORT_CHECKLIST_PDF`, `..._TASKS_SPREADSHEET`, `..._TASK_REPORT_PDF`, `..._TASK_REPORT_XLSX`, `..._SHOPPING_LIST` | Integer costs. |
| `PRODUCTIVITY_EXPORT_FREE_IN_DEV` | `"true"` / `"false"` to override free-in-dev default. |

[`server/productivity-export-pricing.ts`](../server/productivity-export-pricing.ts).

---

## 14. GIF search (community / composer)

| Variable | Purpose |
|----------|---------|
| `GIPHY_API_KEY` or `TENOR_API_KEY` | At least one for GIF search. |

---

## 15. Client-only (`VITE_*`) — must be set at build

These are read in the client via `import.meta.env`. The **Vite** build must see them; changing them without rebuilding does nothing in the browser.

| Variable | Purpose |
|----------|---------|
| `VITE_VAPID_PUBLIC_KEY` | **Same value as** `VAPID_PUBLIC_KEY` (see section 4). |
| `VITE_ENABLE_ANDROID_REMINDERS`, `VITE_ENABLE_WINDOWS_REMINDERS` | Native reminder bridges. |
| `VITE_TEAMS_GRAPH_CLIENT_ID`, `VITE_TEAMS_GRAPH_AUTHORITY`, `VITE_TEAMS_GRAPH_REDIRECT_URI` | Teams / MSAL. |
| `VITE_VIDEO_ROOM_BASE_URL` | Video huddle. |
| `VITE_CONTACT_EMAIL` | Contact page. |

---

## 16. Docker Compose (`.env.docker`, not root `.env`)

| Variable | Purpose |
|----------|---------|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Postgres container. |
| `DATABASE_URL` | Often `...@database:5432/...` inside the stack. |
| `ATTACHMENT_STORAGE_DIR` | Mounted path in container. |
| `AXTASK_ALARM_COMPANION_URL`, `AXTASK_ALARM_COMPANION_SECRET` | Alarm companion bridge. |

[DOCKER_FOUNDATION.md](DOCKER_FOUNDATION.md), [docker-compose.yml](../docker-compose.yml).

---

## 17. Deploy, migrations, and production start

| Variable | Purpose |
|----------|---------|
| `SKIP_DB_PUSH_ON_START` | Skips Drizzle push on `production-start` (migrations still run). |
| `AXTASK_SKIP_DB_CAPACITY_CHECK` | Skips pre-migrate DB size gate. |
| `GITHUB_*` | CI / attestation scripts. |

[DEV_DATABASE_AND_SCHEMA.md](DEV_DATABASE_AND_SCHEMA.md), [production-start.mjs](../scripts/production-start.mjs).

---

## 18. Misc

| Variable | Purpose |
|----------|---------|
| `BILLING_BRIDGE_PYTHON` | Python binary for billing bridge. |
| `GIPHY_API_KEY` / `TENOR_API_KEY` | See §14. |
| `REPL_SLUG`, `REPLIT_DEV_DOMAIN` | Export metadata. |
| `ANALYZE=1` | Vite bundle visualizer (see [`vite.config.ts`](../vite.config.ts)). |

---

## Required in production (deploy checklist)

[`scripts/deploy/check-env.mjs`](../scripts/deploy/check-env.mjs) (`--prod`) enforces at least:

| Variable | Rule |
|----------|------|
| `DATABASE_URL` | Set; must start with `postgres://` or `postgresql://`. |
| `SESSION_SECRET` | Set; length ≥ 20. |
| `NODE_ENV` | Must be `production`. |
| `AUTH_AUDIT_PEPPER` | Set; length ≥ 20. |
| `ARCHETYPE_ANALYTICS_SALT` | Set; length ≥ 16. |
| `TOTP_ENCRYPTION_KEY` | Set; exactly 64 hex characters. |
| `INVITE_CODE` | Required when registration is invite-only (including default invite when `REGISTRATION_MODE` is unset in production); length ≥ 8 after trim. |
| `REGISTRATION_MODE` | If set, must be exactly `open`, `invite`, or `closed`. |
| `VAPID_*` | If any of `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VITE_VAPID_PUBLIC_KEY` is set, all three are required. |

Use `npm run env:audit` / `npm run env:audit:strict` to verify templates and [`render.yaml`](../render.yaml) list these keys.

## See also

- [DEV_DATABASE_AND_SCHEMA.md](DEV_DATABASE_AND_SCHEMA.md) — `DATABASE_URL`, migration order, `db:migrate` / `db:push`.
- [NOTIFICATIONS_AND_PUSH.md](NOTIFICATIONS_AND_PUSH.md) — VAPID, service worker, push troubleshooting, compact VAPID table under **Environment variables**.
- [ADMIN_ACCESS_MODEL.md](ADMIN_ACCESS_MODEL.md), [OPERATOR_COIN_GRANTS.md](OPERATOR_COIN_GRANTS.md), [CLIENT_VISIBLE_PRIVACY.md](CLIENT_VISIBLE_PRIVACY.md).
