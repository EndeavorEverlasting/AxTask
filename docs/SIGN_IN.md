# Sign-in guide (users and local development)

How to open the app and authenticate in **production**, **Docker**, and **Node + local Postgres**. This document is safe for a public repo: it does **not** include operator credentials, SQL, or privileged URLs.

**Operator / admin procedures** (dev seed emails, granting `admin`, production email step-up, `/admin`) are documented in **`docs/internal/`**:

- Start with **[`internal/README.md`](./internal/README.md)**  
- Full template: **[`internal/OPERATOR_RUNBOOK.template.md`](./internal/OPERATOR_RUNBOOK.template.md)** — copy to gitignored **`OPERATOR_RUNBOOK.md`** or paste into your **private wiki**.

---

## Where to sign in

- The app serves a **Login** route (path `/login`). Unauthenticated visits to protected pages redirect there.

---

## What appears on the login screen

- **Email and password** — available when the deployment enables local auth (typical for development; production depends on configuration).
- **Single sign-on** — buttons such as **Google**, **WorkOS**, or **Replit** appear only when the server has the matching OAuth/OIDC environment variables configured.

You can use **any** method the screen offers; multiple providers may show at once.

---

## Production or any hosted deployment

1. Open your deployment’s public URL (for example `https://your-domain.com`).
2. Sign in with **Continue with …** for a configured provider, or with **email and password** if your environment allows it.
3. If **Create account** / **Register** is missing, the deployer may have set **closed** or **invite** registration; use credentials you already have or follow your team’s onboarding (invite codes are operational secrets and stay out of this doc).

Registration behavior is driven by server environment variables such as `REGISTRATION_MODE` and optional `INVITE_CODE`. Your team documents production values internally.

---

## Docker Compose (full stack on your machine)

1. From the repo root, start the stack (see root [README.md](../README.md#run-locally-after-cloning-with-docker)): `npm run docker:start` (or `npm run docker:up` for the guided launcher).
2. Open **http://localhost:5000**.
3. **Demo seeding** is **off by default** in `.env.docker.example` (`AXTASK_DOCKER_SEED_DEMO=0`). To enable it for local Compose only, set **`AXTASK_DOCKER_SEED_DEMO=1`** and restart the stack; the migrate step will seed the user defined by **`DOCKER_DEMO_USER_EMAIL`** / **`DOCKER_DEMO_PASSWORD`** (see comments in `.env.docker.example`). When seeding is on, the **same terminal** can print the demo email and password after startup — use them on the login page.
4. With demo seeding disabled, use **Register** / **Create account** when registration is allowed, or credentials your team supplies.

More context: [DOCKER_FOUNDATION.md](./DOCKER_FOUNDATION.md) (demo login section), `.env.docker.example` ( **`AXTASK_DOCKER_SEED_DEMO`** and demo user variables).

---

## Node.js + local PostgreSQL (`npm run dev`, `npm run local:start`)

Use this path when you run the Express server with `tsx` against Postgres (not the Compose app container).

1. **Environment file:** `npm run local:env-init` creates `.env` from `.env.example` when needed and ensures a strong `SESSION_SECRET` without printing it. Set **`DATABASE_URL`** to a reachable Postgres URL.
2. **Schema:** `npm run db:push` (or use **`npm run local:start`**, which can run DB steps for you).
3. **Start:** `npm run local:start` (or `npm run dev` with **`NODE_ENV=development`**).
4. **Credentials:** With `NODE_ENV=development`, the server seeds **ephemeral development accounts** and prints **email + password** in the **terminal that runs the server** (new passwords each restart). Copy those into the login form.
5. **Alternative:** If local registration is open, use **Create account** with a real email you control. Moving day-to-day work off seed accounts: [LOCAL_ACCOUNT_TRANSITION.md](./LOCAL_ACCOUNT_TRANSITION.md).

If login fails with session errors, run `npm run local:secrets-bootstrap` so `SESSION_SECRET` is long and not a placeholder.

---

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| “Invalid credentials” / immediate logout | `SESSION_SECRET` in `.env` or `.env.docker` (32+ chars, not a placeholder). |
| OAuth redirects to an error page | `BASE_URL` / `CANONICAL_HOST` and provider callback URLs must match exactly. Infrastructure checklist (no secrets): [RENDER_WEB_SERVICE_PASTE_CHECKLIST.md](./RENDER_WEB_SERVICE_PASTE_CHECKLIST.md). |
| No SSO buttons locally | OAuth keys may be unset in `.env`; use email/password or add provider keys for local SSO experiments. |
| Cannot register | `REGISTRATION_MODE` / `INVITE_CODE` — ask your deployer or check internal runbooks. |

---

## Related documentation

- [LOCAL_ACCOUNT_TRANSITION.md](./LOCAL_ACCOUNT_TRANSITION.md) — use a real email on the same local database as seed accounts.
- [OFFLINE_PHASE_B.md](./OFFLINE_PHASE_B.md) — device refresh cookie after sign-in.
- [MFA_SIGNUP_VERIFICATION.md](./MFA_SIGNUP_VERIFICATION.md) — registration vs step-up MFA (policy).
- [README.md](../README.md) — Docker vs Quick Start entry points.

---

## Documentation visibility

[`docs/README.md` — Documentation visibility and planning](./README.md#documentation-visibility-and-planning) explains what stays in the public tree vs internal-only material.
