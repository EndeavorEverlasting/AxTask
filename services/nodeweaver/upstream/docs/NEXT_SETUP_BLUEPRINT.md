# AxTask Next Setup Blueprint (Host + DB + Domain + Product Hooks)

**Date:** 2026-04-03  
**Purpose:** Lay the groundwork for the next production setup with transparent billing, reliable uptime, and a single future infrastructure point for AxTask + NodeWeaver.

## 1) Immediate Platform Direction

Use this baseline first:

- **App hosting:** Render Web Service (AxTask first, NodeWeaver second)
- **Database:** Managed PostgreSQL (Neon or Render PostgreSQL)
- **Domain registrar:** any registrar with transparent renewal pricing + no surprise add-ons
- **DNS/TLS:** managed by hosting provider for fast cutover

Why this baseline:
- Managed Node/Python hosting + simple deploy flow from GitHub
- No Replit lock-in
- Easy to keep Replit as temporary fallback during migration

---

## 2) Priority Workstreams (mapped to your requirements)

## A. Migrate DB + host (make Replit fallback only)

- [ ] Export/verify production backup from current DB
- [ ] Provision target PostgreSQL and test restore
- [ ] Deploy AxTask on target host
- [ ] Deploy NodeWeaver on target host
- [ ] Keep Replit deployment available as fallback route
- [ ] Run daily backup verification on the new DB

## B. Integrate NodeWeaver into one infrastructure/billing plane

- [ ] Deploy NodeWeaver branch `feature/axtask-contract-hardening` separately first
- [ ] Define API contract between AxTask and NodeWeaver (request/response schemas)
- [ ] Add contract tests in CI for both repos
- [ ] Merge runtimes only after stable cost + error baselines are known

## C. Notification + operations integration

- [ ] Add scheduler-driven reminders from AxTask for NodeWeaver-assisted flows
- [ ] Add unified uptime + latency monitoring for both services
- [ ] Add shared incident routing (email/Slack alerts)
- [ ] Add timezone-safe alarm support for technicians

---

## 3) Architecture Target (End State)

**Near term (safe):**
- Two services (AxTask + NodeWeaver), one billing dashboard, one database provider

**End state (after validation):**
- One runtime/deployment artifact
- One secret manager + one monitoring stack
- Shared auth/session and shared domain routing

---

## 4) 14-Day Build Order (groundwork that avoids rework)

1. **Day 1-2:** Host + DB migration (AxTask), backup/restore proof, DNS cutover
2. **Day 3-4:** NodeWeaver publish from hardening branch + uptime/billing alerts
3. **Day 5-7:** Contract validation + category normalization checks
4. **Day 8-10:** Scheduler/reminder integration + operational alerts
5. **Day 11-14:** Integration spike and go/no-go decision for single runtime

---

## 5) Domain Shopping Checklist

Before buying a domain, verify:

- [ ] Renewal price (not just first-year promo)
- [ ] WHOIS privacy pricing/policy
- [ ] Transfer-out policy and cost
- [ ] DNS management quality + API access
- [ ] SSL/TLS compatibility with chosen host

---

## 6) Guardrails That Prevent Surprise Shutdowns

- [ ] Budget alerts at 50/75/90%
- [ ] Hard cap or auto-protect action
- [ ] Weekly resource inventory review
- [ ] Uptime monitors on critical routes (`/health`)
- [ ] Rollback runbook tested quarterly

## 6.1) Usage Statistics Visibility Layer (new requirement)

Implement a small "Usage & Billing" surface so both you and client can see risk before shutdown:

- [ ] Daily/MTD spend card from host billing API (or manual import fallback)
- [ ] Compute-hours and autoscale event timeline
- [ ] Request count, error-rate, and p95 latency chart
- [ ] DB growth + connection usage chart
- [ ] "Days to budget cap" estimate and alert status

### MVP implementation path

1. Add `usage_snapshots` table (date, spend_mtd, compute_hours, requests, errors, p95, db_storage_mb).
2. Add nightly ingestion job from provider APIs (or CSV export if API unavailable).
3. Build `/admin/usage` dashboard page + weekly email digest.
4. Trigger alerts when spend forecast exceeds cap before month end.

---

## 8) Recommended First Commit in This Workstream

1. Add NodeWeaver deployment manifests and health checks.
2. Add AxTask/NodeWeaver contract test stubs in both CI pipelines.
3. Add usage snapshot ingestion and alert thresholds.

This order gives immediate operator value while preserving flexibility for final infrastructure consolidation.
