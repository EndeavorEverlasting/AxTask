# AxTask environment secret checklist

Use this checklist when provisioning a new deployment or rotating secrets.

## Generate with the local tool

Run locally only:

```powershell
npm run env:secrets:generate
```

Paste the output into your password manager and deployment host environment. Do **not** commit generated output. The tool refuses to print secrets in CI unless explicitly overridden.

For only the required production secrets:

```powershell
npm run env:secrets:generate -- --required-only
```

## Required stable production secrets

These must be stable across deploys and restarts.

| Variable | Why it matters | Rotation impact |
|---|---|---|
| `SESSION_SECRET` | Signs sessions/cookies. | Logs users out. |
| `AUTH_AUDIT_PEPPER` | Peppers auth/security hashes. | Breaks comparisons against old peppered values. |
| `TOTP_ENCRYPTION_KEY` | Encrypts authenticator secrets at rest. Must be 64 hex chars. | Can make existing TOTP secrets unreadable unless migrated. |
| `ARCHETYPE_ANALYTICS_SALT` | HMAC salt for privacy-preserving archetype analytics. | Breaks longitudinal/Markov continuity. |

## Feature secrets to generate if enabled

| Variable | Generate when |
|---|---|
| `BACKUP_ENCRYPTION_KEY` | Encrypted backup/export storage is enabled. Store carefully; losing it can make backups unrecoverable. |
| `ARCHETYPE_READ_TOKEN` | A non-admin service needs token-based archetype analytics reads. |
| `AXTASK_ALARM_COMPANION_SECRET` | Native alarm companion bridge is enabled. |
| `ATTACHMENT_UPLOAD_SECRET` | You want upload token signing separate from `SESSION_SECRET`. |
| `INVITE_CODE` | `REGISTRATION_MODE=invite`. |

## Generate separately

Web Push VAPID is a key pair, not a generic secret. Generate it with:

```powershell
npm run vapid:generate -- --subject mailto:you@example.com
```

Then set all four generated lines together:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `VITE_VAPID_PUBLIC_KEY`

`VITE_VAPID_PUBLIC_KEY` is client-visible and must be present at build time.

## Do not generate manually with this tool

These values come from providers or deployment decisions, not random password generation:

| Variable family | Source |
|---|---|
| `DATABASE_URL` | Neon/Postgres provider. |
| `GOOGLE_*`, `WORKOS_*`, `RESEND_API_KEY` | Provider dashboards. |
| `BACKUP_S3_*`, `REDIS_URL` / `REDIS_*` | Object-store/Redis provider or infrastructure config. |
| `BASE_URL`, `CANONICAL_HOST`, `FORCE_HTTPS`, `PORT`, feature flags, intervals | Operator configuration. |

## Local vs production

Local development may use temporary values for convenience. Production must use stored, stable values. Never generate fresh production values automatically on every boot.

See also: [Environment variables reference](ENVIRONMENT_VARIABLES.md) and [Backup and restore](BACKUP_AND_RESTORE.md).
