# Morning Migration Checklist (Execution-Only)

Use this on a fresh machine to execute quickly and safely.

## 0) Confirm branches

- [ ] AxTask on `main`
- [ ] NodeWeaver on `feature/axtask-contract-hardening`

## 1) New box setup

- [ ] Install Git, Node.js 20+, npm, Python 3.11+
- [ ] Clone AxTask repo
- [ ] Clone NodeWeaver repo
- [ ] Verify `git branch --show-current` in each repo

## 2) Pick vendors (once)

- [ ] App host selected (Render/Railway/Fly)
- [ ] Managed Postgres selected (Neon/Render/Supabase)
- [ ] Domain registrar selected (Cloudflare/Porkbun/Namecheap)
- [ ] Renewal/WHOIS/transfer policies verified

## 3) Secrets and environment

## AxTask
- [ ] `DATABASE_URL`
- [ ] `SESSION_SECRET`
- [ ] `NODE_ENV=production`
- [ ] `PORT=5000`
- [ ] `CANONICAL_HOST=<primary-domain>`
- [ ] `REPLIT_FALLBACK_HOST=<replit-app>.replit.app`
- [ ] `FORCE_HTTPS=true`
- [ ] OAuth/provider vars configured

## NodeWeaver
- [ ] `DATABASE_URL`
- [ ] `SESSION_SECRET`
- [ ] `PORT=5000`
- [ ] `FLASK_ENV=production`
- [ ] `FLASK_DEBUG=false`

## 4) Deploy safely

- [ ] Deploy AxTask first
- [ ] AxTask `GET /health` = 200
- [ ] AxTask `GET /ready` = 200
- [ ] AxTask smoke test: login + task CRUD + planner
- [ ] Deploy NodeWeaver from `feature/axtask-contract-hardening`
- [ ] NodeWeaver `GET /health` = 200
- [ ] NodeWeaver `GET /api/v1/version` = expected
- [ ] Contract smoke test with AxTask-shaped payload

## 5) Guardrails before DNS

- [ ] Budget alerts at 50/75/90
- [ ] Daily usage digest enabled
- [ ] Uptime checks active
- [ ] Replit remains untouched/hot

## 6) DNS cutover

- [ ] Lower TTL to 300
- [ ] Point domain to new host
- [ ] Monitor auth, 5xx, p95, DB connections
- [ ] Keep Replit fallback for 7 days

## 7) Rollback readiness

- [ ] Replit target documented
- [ ] One-step DNS failback confirmed
- [ ] Incident log template ready

## 8) Axios security enforcement

- [ ] AxTask: `git config core.hooksPath .githooks`
- [ ] AxTask: `npm run security:axios-guard`
- [ ] NodeWeaver: `git config core.hooksPath .githooks`
- [ ] NodeWeaver: `python scripts/check_no_axios.py` (or `py -3 ...` on Windows)

## 9) Finish

- [ ] Commit changes
- [ ] Push branch
- [ ] Open/refresh PR
