# Sign-up verification and MFA (abuse reduction)

**Status:** Planning / product requirements (not yet implemented as a mandatory registration gate)  
**Related:** [`OTP_DELIVERY.md`](./OTP_DELIVERY.md), [`AUTH_IMPLEMENTATION_PLAN.md`](./AUTH_IMPLEMENTATION_PLAN.md), [`SECURITY.md`](./SECURITY.md) (reporting), [`SECURITY_TECHNICAL_REFERENCE.md`](./SECURITY_TECHNICAL_REFERENCE.md) (architecture notes)

## Scope: existing users vs new registrations

- **Existing accounts are unchanged.** Users who already have an account continue to sign in with **email/password (or OAuth)** as they do today. They are **not** required to add MFA for everyday login when this work ships.
- **Step-up MFA stays contextual.** Logged-in users still encounter OTP (or future step-up factors) **only** for sensitive flows that already require it — for example billing, certain invoice actions, and phone verification — not as a blanket requirement on each sign-in.
- **New registrations are the target.** The abuse-reduction work applies to **creating** a new account: prove control of the email (or agreed channel) **during sign-up**, so automated or throwaway registration becomes harder. That is a **registration gate**, not a retroactive login mandate.

## Why this matters

Open registration with only email and password invites:

- **Spam and throwaway accounts** — bulk signups for scraping, feedback abuse, or resource exhaustion.
- **Credential stuffing and account farming** — automated registration to probe the system or build reputation for later abuse.
- **Harassment and ban evasion** — new identities without a costly verification step.

Requiring a **reachable, verified channel** (typically email OTP; optionally SMS) at account creation raises the cost of abuse while staying understandable for legitimate new users.

## Current behavior (baseline)

- **`POST /api/auth/register`** creates a user, hashes the password, and **immediately** establishes a session (auto-login). Registration can be gated by **`REGISTRATION_MODE`** (`open` | `invite` | `closed`) and an optional single **`INVITE_CODE`** (see server configuration).
- **Step-up MFA** exists **after** authentication: `POST /api/mfa/challenge` requires `req.user` and persists challenges in **`mfa_challenges`** with a **`user_id`**. Purposes today are billing, invoicing, and phone verification (`shared/mfa-purposes.ts`).
- **OTP delivery** (Resend / Twilio in production, console / `devCode` in development) is described in [`OTP_DELIVERY.md`](./OTP_DELIVERY.md).

So **new users cannot yet complete “MFA to create their account”** using the same endpoints as logged-in step-up MFA; product and engineering need an explicit **pre-account** or **pending-account** flow.

## Product principles

1. **Verify before granting a full account** — Prefer confirming control of an email (minimum) before the user can create tasks, send feedback, or consume paid-tier resources.
2. **Default to email OTP** — Aligns with existing Resend path, avoids SMS cost and regulatory overhead unless you explicitly offer SMS sign-up.
3. **Minimize friction for real users** — Clear copy, resend limits, accessible error states, and optional “continue on this device” session hints without weakening verification.
4. **Layer defenses** — Verification is one layer; combine with **rate limits**, **invite-only** periods, optional **CAPTCHA** / proof-of-work, and **security event** logging (already present for auth).
5. **Respect privacy** — For SMS, capture **explicit consent** and document retention; avoid collecting phone numbers solely for marketing without opt-in.

## Sync/integration security boundary

Treat synchronization and external integrations (for example cloud sync or third-party APIs) as higher-risk actions:

- Require a valid authenticated session before any sync operation.
- Require recent step-up MFA for linking/unlinking external accounts and for authorizing new sync scopes.
- Expire sync authorization on password reset, suspicious-login events, or explicit security revocation.
- Keep local/offline demo mode isolated from production sync credentials and enforce clear mode labeling in UI.

## Threat model and mitigations

| Risk | Mitigations to consider |
|------|-------------------------|
| Automated signup bots | Per-IP and per-email rate limits; CAPTCHA or equivalent on “request code” / “complete signup”; invite-only mode during attacks |
| Disposable / burner email domains | Optional blocklist or commercial reputation API; stricter limits for unknown domains |
| OTP brute force | Short TTL, low max attempts (aligned with existing MFA attempt caps), lockout or backoff per email/IP |
| OTP interception / phishing | Short codes, clear branding in messages, no codes in URLs; educate users in UI |
| SMS pumping / toll fraud | If SMS is offered at sign-up, use provider fraud controls, geo limits, and **never** enable SMS verification without Twilio (or equivalent) hardening |
| Enumeration (“is this email registered?”) | Uniform API responses and timing discipline for “request code” vs “complete signup” (same as password reset best practices) |
| Cost blowout (email/SMS) | Aggressive rate limits; monitoring and alerts on challenge creation volume |

## Design options (engineering)

These are **not** mutually exclusive; pick based on UX and schema appetite.

1. **Email OTP before user row**  
   - Store pending signups in a **`signup_verifications`** (or similar) table: email hash, code hash, expiry, attempts, optional `invite_code` snapshot.  
   - **Only after** successful verification: create `users` row and session (or return a one-time token to set password in a second step).

2. **Pending user + post-create verification**  
   - Create a user in a **`pending_verification`** state (flag or `email_verified_at` null) with **restricted** API access until OTP is confirmed.  
   - Reuses `user_id` for `mfa_challenges` if you add a purpose like `signup:verify_email` — but you must **not** allow sensitive actions until verified.

3. **Magic link**  
   - Single-use signed URL instead of typing a code; still rate-limit and log. Can complement OTP for accessibility.

4. **OAuth-only sign-up**  
   - Google / WorkOS / etc. already assert email control; treat as verified per your trust policy; still consider invite mode and rate limits.

**Schema note:** Today `mfa_challenges.user_id` is **NOT NULL** and references `users`. Any **pre-user** OTP flow either needs a separate table or a carefully scoped pending user row.

## Configuration and operations

- **Environment:** Reuse `RESEND_API_KEY` / Twilio variables from [`OTP_DELIVERY.md`](./OTP_DELIVERY.md); add feature flags such as `SIGNUP_EMAIL_VERIFICATION=required|optional|off`.
- **Deliverability:** Monitor bounces; avoid sending verification from domains without SPF/DKIM.
- **Observability:** Emit security events for `signup_otp_requested`, `signup_otp_failed`, `signup_completed`, correlated with IP and (hashed) email where privacy policy allows.

## Documentation and rollout

1. Update **login/register UI** copy so it is obvious that verification applies to **new** sign-ups only; **existing users** keep the same login experience (plus any step-up MFA they already see on sensitive actions).  
2. Add **internal operator runbook** steps: how to disable open registration, rotate invite codes, and respond to OTP spam spikes (keep out of the public repo).  
3. **Staging:** Run full registration path with Resend test domain before enabling in production.

## See also

- Implementation checklist (high level): schema for pending signups or `email_verified` gating; `SIGNUP_EMAIL_VERIFICATION` env; rate limits and uniform API responses; staging with Resend test domain before production. Details: [`AUTH_IMPLEMENTATION_PLAN.md`](./AUTH_IMPLEMENTATION_PLAN.md).  
- Auth history and file map: [`AUTH_IMPLEMENTATION_PLAN.md`](./AUTH_IMPLEMENTATION_PLAN.md)  
- Step-up MFA delivery: [`OTP_DELIVERY.md`](./OTP_DELIVERY.md)
