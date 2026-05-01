# Session threat model (browser cookies)

AxTask uses a **classic server-side session** with a signed cookie (`axtask.sid`) backed by PostgreSQL (`connect-pg-simple`). This document situates that model against common attacks and **future** browser mitigations such as **Device Bound Session Credentials (DBSC)**.

## What HttpOnly / Secure / SameSite do and do not cover

The server sets **HttpOnly** (not readable from page JavaScript), **Secure** in production, and **SameSite=Lax** on the session cookie. Together they reduce **cross-site** abuse and **typical XSS** exfiltration of the session id.

They do **not** fully protect against:

- **Same-user malware** that runs in the user’s OS account and can read browser cookie stores or memory while the user is logged in.
- **Pass-the-cookie** in the sense of copying a valid session cookie to another **machine** and replaying it until expiry (unless the browser and origin participate in stronger binding—see DBSC below).

Anything returned to the SPA is also visible in DevTools; see [CLIENT_VISIBLE_PRIVACY.md](CLIENT_VISIBLE_PRIVACY.md).

## Device Bound Session Credentials (DBSC) — watch item

**DBSC** (Chromium-led) aims to bind sessions to **proof of possession** using a **non-exportable** key (for example in a TPM), so a stolen cookie file alone is insufficient on another device. The **browser** performs cryptographic operations; the **origin** follows the registration and verification protocol once browsers and middleware patterns are stable.

AxTask does **not** implement DBSC today. When the protocol and server integration are broadly available, evaluate: opt-in headers/endpoints, compatibility with `express-session`, and graceful fallback for browsers without DBSC.

## Other principles (short-lived sessions, cache, WebAuthn)

- **Shorter session lifetime** reduces the window if a cookie is copied. Operators can tune duration with `SESSION_MAX_AGE_MS` (see [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md)).
- **Encrypted browser cache** (DPAPI, Keychain, etc.) is implemented by the **browser/OS**, not by this Express app.
- **WebAuthn / passkeys** provide hardware-backed challenge–response for sign-in or step-up; AxTask does not ship passkeys yet. Consider them for high-risk flows independently of DBSC.

## Server-side controls in this repo

- Session signing secret: `SESSION_SECRET`.
- CSRF double-submit cookie for mutating `/api` requests (see `server/index.ts`), with max-age aligned to session duration via shared config (`server/session-config.ts`).
- Logout and server-side session destruction invalidate the store entry; banned users are rejected in `requireAuth`.

For client-visible field policy, stay with serializers in `shared/public-client-dtos.ts`.
