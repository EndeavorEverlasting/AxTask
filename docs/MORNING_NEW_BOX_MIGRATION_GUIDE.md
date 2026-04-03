# Morning Migration Guide (Safe + Reversible)

**Date prepared:** 2026-04-03  
**AxTask branch:** `main`  
**NodeWeaver branch for deployment:** `feature/axtask-contract-hardening`

This guide is designed for a fresh machine in the morning and prioritizes:
- no downtime surprises
- immediate Replit fallback
- clear vendor/domain decisions
- clean commit/push workflow

---

## 1) Non-Negotiable Safety Rules

1. Keep Replit production untouched until both new hosts are stable.
2. Do not rotate secrets during first cutover window unless required.
3. Do not do DB schema-breaking changes during DNS transition.
4. Only cut DNS after health + smoke tests pass.
5. Keep rollback ready for 7 days.

---

## 2) New Box Setup (first 20 minutes)

## Install

- Git
- Node.js 20+ and npm
- Python 3.11+
- Render CLI optional (UI is fine)

## Clone repositories

```bash
# AxTask
git clone <Axtask-Repo-URL> AxTask
cd AxTask
git checkout main

# NodeWeaver (separate terminal)
git clone <NodeWeaver-Repo-URL> NodeWeaver
cd NodeWeaver
git checkout feature/axtask-contract-hardening
```

## Verify branches

```bash
git branch --show-current
```

Expected:
- AxTask: `main`
- NodeWeaver: `feature/axtask-contract-hardening`

---

## 3) Vendor/Hosting Shopping (pick once, then execute)

## App host (choose one)

- **Render (recommended baseline):** easiest managed web services, simple health checks.
- **Railway:** fast setup, good DX, watch pricing detail.
- **Fly.io:** great control/performance, slightly more ops complexity.

Choose based on:
- clear pricing dashboard
- budget alerts
- custom domain/TLS support
- easy rollback and deploy history

## Managed Postgres (choose one)

- **Neon:** strong Postgres DX, branching/backups.
- **Render Postgres:** simpler single-provider ops with Render host.
- **Supabase Postgres:** strong ecosystem + SQL tooling.

Choose based on:
- automated backups + point-in-time restore
- connection limits
- transparent monthly pricing

## Domain registrar (choose one)

- **Cloudflare Registrar** (at-cost renewals, strong DNS)
- **Porkbun** (transparent pricing, generally low renewals)
- **Namecheap** (common, easy UX; verify renewal pricing)

Before buying:
- renewal price
- WHOIS privacy policy/cost
- transfer-out policy
- DNS quality/API access

---

## 4) Environment and Secrets Checklist

## AxTask required

- `DATABASE_URL`
- `SESSION_SECRET`
- `NODE_ENV=production`
- `PORT=5000`
- `CANONICAL_HOST=<primary-domain>`
- `REPLIT_FALLBACK_HOST=<your-replit-app>.replit.app`
- `FORCE_HTTPS=true`
- OAuth/provider values you use (`GOOGLE_*`, `WORKOS_*`, etc.)

## NodeWeaver required

- `DATABASE_URL`
- `SESSION_SECRET`
- `PORT=5000`
- `FLASK_ENV=production`
- `FLASK_DEBUG=false`

Do not commit real secrets. Use host secret managers only.

---

## 5) Deploy Order (Safe Sequence)

1. Deploy **AxTask** to new host from `main`.
2. Validate:
   - `GET /health` returns 200
   - `GET /ready` returns 200
   - login + task CRUD + planner actions
3. Deploy **NodeWeaver** from `feature/axtask-contract-hardening`.
4. Validate:
   - `GET /health` returns 200
   - `GET /api/v1/version` returns expected version
   - AxTask-shaped contract request works end-to-end
5. Enable budget alerts at 50/75/90 and usage notifications.
6. Cut DNS with low TTL (300), monitor, keep Replit hot.

---

## 6) Rollback (must be ready before DNS cut)

If auth, API, or latency regresses:

1. Point DNS back to Replit target.
2. Confirm Replit health.
3. Keep new hosts running for debugging (do not delete).
4. Capture failing endpoint + timestamp + payload shape.

---

## 7) Axios Security Gates (already prepared)

Both repos include:
- CI guard workflow: blocks Axios introduction
- local hook scripts: pre-commit + pre-push Axios check

Activate hooks on new box (run in each repo root):

```bash
git config core.hooksPath .githooks
```

Manual checks:
- AxTask: `npm run security:axios-guard`
- NodeWeaver: `python scripts/check_no_axios.py`

---

## 8) Commit + Push Routine (after morning edits)

Use this order per repo:

```bash
git status
git add .
git commit -m "docs: add safe migration handoff guide and cutover guardrails"
git push origin <your-branch>
```

If pushing NodeWeaver deployment prep, keep branch as:
- `feature/axtask-contract-hardening`

---

## 9) Optional Cleanup: NodeWeaver Nested Folder

If your local machine still has a nested `NodeWeaver/NodeWeaver` layout, flatten only when not under time pressure. It is safe to postpone until after production cutover. The migration itself is not blocked by that layout as long as you run commands from the actual repo root (the directory containing `.git`).
