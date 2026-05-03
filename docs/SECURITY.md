
# AxTask — Security Architecture

**Version:** 2.0.0
**Last Updated:** May 2026
**Status:** Production

---

## Overview

This document describes the current security posture of AxTask as deployed in production at `axtask.app` and `axtask.dev`. It covers authentication, session management, cryptographic controls, network-level protections, rate limiting, audit logging, and operational security. All controls described here are **implemented and active** unless explicitly noted as scaffolded or planned.

---

## Authentication Architecture

### Four-Tier Provider Cascade

AxTask supports four authentication providers in a priority cascade. The active provider is determined at startup by `AUTH_PROVIDER`, falling back to automatic detection from available credentials:

| Tier | Provider | Mechanism | Env Vars Required |
|------|----------|-----------|-------------------|
| 1 | **WorkOS AuthKit** | Enterprise SSO (SAML/OIDC via WorkOS) | `WORKOS_API_KEY`, `WORKOS_CLIENT_ID` |
| 2 | **Google OAuth 2.0** | Authorization Code flow | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| 3 | **Replit OIDC** | PKCE Authorization Code (Google/GitHub/Apple via Replit) | `REPL_ID` |
| 4 | **Local Passport.js** | Email + bcrypt password | Always available |

All available providers register routes at startup. The cascade allows multiple providers to coexist and users to be matched by email across providers.

### OAuth / OIDC Security Controls

Security controls vary by provider:

| Control | WorkOS | Google OAuth 2.0 | Replit OIDC |
|---------|--------|-----------------|-------------|
| State token generated | Yes | Yes | Yes |
| State token **validated** in callback | No | No | Yes (via `authorizationCodeGrant`) |
| PKCE (S256) | No | No | Yes |
| Redirect URI binding | Session-stored | Session-stored + fallback reconstruction | Implicit in OIDC flow |

- **Replit OIDC** is the most hardened provider — it uses PKCE (S256) and validates state via the `openid-client` library's `authorizationCodeGrant`, which verifies state, nonce, and code exchange in a single call.
- **WorkOS and Google** generate a random state value and store it in session, but the current callbacks do not explicitly check `req.query.state` against the stored value. This is a known gap — state validation for these providers should be added in a security hardening task.
- **Redirect URI binding** (Google/WorkOS): the redirect URI is stored in session at login and retrieved at callback, ensuring the same URI is used for both legs of the flow.
- **Ban check** runs on every successful OAuth callback before session creation.
- **Security audit log entry** on every login (success and failure).

### Local Authentication

- Passwords hashed with **bcrypt** (cost factor 12)
- **Account lockout** — automatic lockout after repeated failed login attempts
- **Strong password policy** — enforced at registration and password change
- **Security questions** — available as an account recovery option
- **Hashed password reset tokens** — reset links use cryptographically random, single-use, time-limited tokens; token stored as SHA-256 hash in the database (raw token sent once via email/response, never stored)

### Multi-Factor Authentication (MFA / TOTP)

- TOTP-based two-factor authentication via `otpauth` (RFC 6238)
- Compatible with Google Authenticator, Authy, and any standard TOTP app
- **MFA secrets encrypted at rest** with AES-256-GCM before database storage
- QR code enrolment flow via `qrcode`
- MFA **required** for destructive Danger Zone operations (e.g., clearing all tasks)
- Backup codes generated at enrolment and stored as bcrypt-hashed values

---

## Session Management

| Property | Value |
|----------|-------|
| Storage | PostgreSQL via `connect-pg-simple` (not in-memory) |
| Cookie flags | `httpOnly: true`, `sameSite: "lax"` |
| Secure flag | `secure: true` in production (HTTPS only) |
| Session secret | Random, stored in `SESSION_SECRET` env var (Replit Secret) |
| Expiry | Automatic session expiration and cleanup |
| Session fixation | New session created per login via Passport's `req.login()` |

Session tokens are never exposed to client-side JavaScript (`httpOnly`). All session data stored server-side in PostgreSQL.

---

## Account Security

### User Banning
- Administrators can ban accounts via the Security Admin UI
- Ban check runs on **every** OAuth callback and local login attempt
- Banned users receive a 403 with the message "This account has been suspended"
- Ban events are logged to the security audit log

### Account Lockout
- Automatic lockout after repeated failed login attempts (brute-force protection)
- Lockout status stored in the database, not in memory (survives server restarts)
- Lockout events logged to the security audit log

### Security Admin UI
- Accessible only to admin-role users
- Functions: view all users, ban/unban accounts, reset lockouts, view the full security audit log
- All admin actions generate audit log entries

---

## Network-Level Security

### Security Headers (helmet)

All responses in production include:

| Header | Value |
|--------|-------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `Content-Security-Policy` | Restrictive CSP — `default-src 'self'`, with specific allowlists for scripts, styles, and media |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `X-XSS-Protection` | `1; mode=block` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

HSTS is enforced in production, ensuring all traffic to `axtask.app` and `axtask.dev` is served over HTTPS.

### Rate Limiting (express-rate-limit)

| Endpoint Group | Limit |
|----------------|-------|
| Authentication routes (`/api/auth/login`, forgot-password, etc.) | 10 attempts per 15 minutes per IP |
| MFA / sensitive routes | 3 attempts per 60 minutes per IP |
| General API reads | 120 requests per 60 seconds per IP |
| General API writes | 30 requests per 60 seconds per IP |
| File upload endpoints | Restricted by file size and rate |

Rate limit responses use standard `429 Too Many Requests` with `Retry-After` headers.

### CORS and Origin Enforcement

In production, state-mutating API requests (`POST`, `PUT`, `PATCH`, `DELETE`) to `/api/*` are validated against an allowed-origin list in `server/index.ts`. Requests whose `Origin` or `Referer` header does not match the list receive `403 Forbidden`.

**Current code state**: The allowed origin is set to `https://axtask.replit.app` via `const productionDomain = "axtask.replit.app"` at line 17 of `server/index.ts`. The same value is used for HTTPS-redirect enforcement. This is a **stale reference** — the canonical production domains are `axtask.app` and `axtask.dev`. A separate code task should update `productionDomain` (and the host-redirect middleware) to reflect the live custom domains.

Development bypasses origin enforcement entirely (`isDev === true`).

### Request Size Limits

Express body parser is configured with request size limits to prevent denial-of-service via large payloads. File uploads via `multer` are restricted to 5 MB per file, 3 files per task.

---

## Data Protection

### Input Validation

All API endpoints validate input using Zod schemas defined in `shared/schema.ts`. Validation runs on both client (React Hook Form) and server (Express middleware). Invalid requests are rejected with `400 Bad Request` before reaching the database layer.

### SQL Injection Prevention

All database operations use **Drizzle ORM** with parameterized queries. No raw SQL string concatenation. Zod validation runs before any database operation.

### XSS Prevention

- React's JSX escaping prevents reflected XSS in rendered content
- Markdown content is sanitised before rendering
- No `dangerouslySetInnerHTML` usage in the application
- CSP headers provide defence-in-depth

### Sensitive Data Handling

| Data Type | Protection |
|-----------|-----------|
| Passwords | bcrypt (cost 12) — never stored in plaintext |
| MFA secrets | AES-256-GCM encryption at rest |
| Password reset tokens | SHA-256 hashed — raw token sent once via email/response, hash stored in DB |
| Session tokens | httpOnly cookies — not accessible to JavaScript |
| API keys / secrets | Replit Secrets (environment-encrypted) — never in source code |
| Database URL | Replit Secret — never hardcoded |

### Encryption in Transit

All production traffic is served over HTTPS. HSTS with preload ensures browsers enforce HTTPS for all future visits to `axtask.app` and `axtask.dev`. Replit Autoscale (Cloud Run) terminates TLS at the load balancer.

---

## Security Audit Logging

All significant security events are written to the `security_audit_log` database table and are viewable in the Security Admin UI.

### Logged Events

| Event | Details Captured |
|-------|-----------------|
| `login_success` | user ID, IP, provider |
| `login_failed` | email attempted, IP |
| `login_banned_attempt` | email, IP, provider |
| `oauth_login_success` | user ID, IP, provider |
| `logout` | user ID, IP |
| `password_change` | user ID, IP |
| `mfa_enabled` | user ID, IP |
| `mfa_disabled` | user ID, IP |
| `account_locked` | user ID, IP, attempt count |
| `admin_action` | admin user ID, target user ID, action |
| `password_reset_requested` | email, IP |
| `password_reset_completed` | user ID, IP |

Log entries include timestamp, IP address, user agent, and relevant identifiers. The audit log is append-only from the application layer — no delete API exists.

---

## File Upload Security

- Accepted MIME types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- Maximum file size: 5 MB per file
- Maximum files per task: 3
- Files processed by `sharp` for thumbnail generation — strips EXIF data
- No persistent disk storage — files are streamed/processed immediately
- Upload endpoints require authentication (`requireAuth` middleware)

---

## Production Security Checklist

### Currently Implemented
- [x] All secrets in Replit Secrets (not hardcoded)
- [x] HTTPS enforced with HSTS and preload
- [x] CSP headers configured via helmet
- [x] Rate limiting on auth and API routes
- [x] bcrypt password hashing
- [x] MFA (TOTP) with AES-256-GCM secret encryption
- [x] Account lockout after failed logins
- [x] User banning with admin UI
- [x] PostgreSQL-backed sessions (httpOnly, secure)
- [x] Security audit logging
- [x] Input validation (Zod) on all endpoints
- [x] SQL injection prevention (Drizzle ORM parameterized queries)
- [x] XSS protection (React JSX escaping + CSP)
- [x] File upload restrictions (type, size, count)
- [x] Request size limits
- [x] Four-tier auth cascade with PKCE and CSRF state tokens
- [x] Ban check on every OAuth callback

### Production Domains
The canonical production domains are:
- `https://axtask.app` (primary)
- `https://axtask.dev` (secondary)

These domains are managed externally. The domain-enforcement constant in `server/index.ts` (`productionDomain`) currently reads `"axtask.replit.app"` — a stale value that needs updating to the live custom domains in a separate code task. See `AGENT_GUARDRAILS.md` for the full domain policy.

---

## Compliance Considerations

- **GDPR**: Users can request data deletion. Task export provides data portability.
- **Password security**: Compliant with NIST SP 800-63B (bcrypt, no composition rules, lockout)
- **Transport security**: TLS 1.2+ enforced by Cloud Run / Replit Autoscale

---

## Incident Response

### On a Suspected Security Breach

1. **Contain**: Use the Security Admin UI to ban affected accounts immediately.
2. **Preserve**: Download the security audit log before any changes.
3. **Assess**: Review audit log for the breach timeline and scope.
4. **Remediate**: Rotate affected secrets via Replit Secrets panel.
5. **Monitor**: Watch audit log for continued anomalous activity.
6. **Recover**: Reset affected user passwords and sessions.

### On a 403 During OAuth Login

A 403 during OAuth is almost always a redirect URI mismatch, not a code bug. See the `## Authentication Troubleshooting — 403 Errors & OAuth Redirect URI Mismatches` section in `replit.md` for the full diagnostic checklist.

---

*This document should be reviewed whenever authentication, session, or cryptographic controls are modified.*
