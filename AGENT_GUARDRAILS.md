# ⚠️ AGENT GUARDRAILS — READ THIS FIRST

> **Any agent, assistant, or automated tool working on this codebase MUST read and respect the rules in this document before making any changes.**

---

## 1. Production Domains — DO NOT TOUCH

AxTask has two registered production domains managed externally:

- **`axtask.app`** — primary production domain
- **`axtask.dev`** — secondary production domain

**These domains must never be changed, removed, or reconfigured.** Domain settings are managed outside the codebase (Replit deployment panel and DNS registrar). Do not add, remove, or modify any domain references in `.replit`, deployment config, or environment variables related to these domains.

---

## 2. Forbidden Files — NEVER EDIT

The following files are **off-limits** to all agents and automated tools. Editing them can break the build pipeline, deployment, authentication, or the database:

| File | Reason |
|------|--------|
| `.replit` | Deployment target, port mapping, and workflow definitions. Misconfiguring this breaks autoscale deployment. |
| `vite.config.ts` | Frontend build configuration. The Vite setup already handles all aliasing and proxying. Do not touch. |
| `server/vite.ts` | Dev server integration. Configured to serve frontend and backend on the same port. Do not touch. |
| `drizzle.config.ts` | ORM/migration config pointing at the production database. Wrong changes can corrupt or drop tables. |
| `package.json` (scripts section) | Build and start scripts are tuned for Replit Autoscale. Changing them breaks CI and deployment. |

If you believe one of these files needs to change, **stop and ask the user explicitly** — do not edit speculatively.

---

## 3. Authentication System — DO NOT RESTRUCTURE

AxTask has a **four-tier authentication cascade** that is working correctly in production:

```
Tier 1: WorkOS AuthKit  (enterprise SSO — WORKOS_API_KEY + WORKOS_CLIENT_ID)
Tier 2: Google OAuth 2.0 (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET)
Tier 3: Replit OIDC      (REPL_ID — Google/GitHub/Apple via Replit identity)
Tier 4: Local auth       (Passport.js email + bcrypt password — always available)
```

The provider is selected at runtime via the `AUTH_PROVIDER` environment variable, with automatic fallback to whichever credentials are present. Key files:

- `server/auth-providers.ts` — all OAuth/OIDC route handlers
- `server/auth.ts` — Passport.js strategy and session serialization
- `server/storage.ts` — `findOrCreateOAuthUser`, `isUserBanned`, `logSecurityEvent`

**Do not reorganise, rename, or remove any tier.** Do not change the provider detection logic in `getProvider()`. Do not swap the Passport.js session strategy for a different library without explicit user instruction.

MFA (TOTP) is also live — secrets are encrypted with AES-256-GCM. Do not change the encryption scheme.

---

## 4. Deployment — DO NOT RECONFIGURE

The application is deployed on **Replit Autoscale** (Google Cloud Run). The deployment is live and serving production traffic. Key constraints:

- Single exposed port (`5000` → external `80`)
- `NODE_ENV=production` in the autoscale runtime
- Build command: `npm run build` → produces `dist/index.js` + `dist/public/`
- Start command: `npm run start`
- Stateless — no in-memory state persists between requests

Do not change the deployment target, build command, start command, or port configuration. Do not add a second process manager (PM2, etc.) — Replit Autoscale manages the process lifecycle.

---

## 5. Database — NEVER DROP TABLES

The PostgreSQL database (Replit Helium) is the **live production database**. Schema changes are cumulative and additive.

- **Never** run `DROP TABLE`, `TRUNCATE`, or destructive `ALTER TABLE` without explicit written confirmation from the user.
- **Never** run `drizzle-kit push` in a way that drops existing columns or tables.
- **Never** delete or reset the `DATABASE_URL` secret.
- Always prefer additive migrations (new columns with defaults, new tables).

---

## 6. What Agents ARE Allowed To Do

To be clear about what is in scope:

- Add new API routes in `server/routes.ts`
- Add new React pages/components under `client/src/`
- Add new database tables or columns (additively) in `shared/schema.ts`
- Update `replit.md` and documentation files
- Install new npm packages using the package management tool
- Modify any application-level feature code that is not in the forbidden file list above

---

## 7. Known Stale Reference — Domain Constant

`server/index.ts` line 17 contains:

```typescript
const productionDomain = "axtask.replit.app";
```

This is a stale value. The canonical production domains are `axtask.app` and `axtask.dev`. This constant drives CORS origin enforcement and HTTPS redirect logic. **Do not change it speculatively** — update it only when the user explicitly asks for the domain migration code task. Changing it without also updating Google OAuth redirect URIs, session cookie domains, and other related config could break production logins.

> The agent guardrails skill is at `.local/skills/axtask-guardrails/SKILL.md`. This location is managed by the Replit platform and intentionally excluded from git — it is present in the workspace and loaded automatically by the agent framework.

## 8. Before Making Any Auth / Deployment / Config Change

1. Read `replit.md` — specifically the `## AGENT GUARDRAILS — READ FIRST` section.
2. Read this file (`AGENT_GUARDRAILS.md`).
3. Check whether the change touches any forbidden file or domain.
4. If yes — **stop and ask the user**.
