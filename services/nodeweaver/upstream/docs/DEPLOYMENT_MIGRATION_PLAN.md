# AxTask + NodeWeaver Emergency Publishing Plan (Off Replit)

**Date:** 2026-04-03  
**Timeline:** Start today, cutover in 48 hours  
**Primary goal:** Keep AxTask continuously available for you and technicians with transparent billing controls.

## 1) Decision for Today

Because uptime is urgent and NodeWeaver is not yet published, execute this sequence:

1. **Today:** move/publish **AxTask** to a non-Replit host you control.
2. **Within 24-48 hours:** publish **NodeWeaver** as a separate service from its GitHub repo.
3. **After stability:** evaluate Option B integration (single runtime) using real cost + reliability data.

This keeps downtime risk low while still moving quickly away from Replit billing surprises.

---

## 2) Why this sequence (fast + safer)

### Option A now (separate deployment, immediate)

**Pros**
- Lowest short-term migration risk
- Fastest path to restore predictable uptime today
- Easier rollback if anything breaks

**Cons**
- Two services to monitor/bill

### Option B later (integrate AxTask + NodeWeaver)

**Pros**
- One release artifact and potentially lower fixed overhead
- Cleaner long-term operations

**Cons**
- Higher short-term merge risk (auth/session/routing collisions)
- Harder to debug under urgent outage pressure

---

## 3) 48-Hour Execution Checklist (Actionable)

## Day 1 -- AxTask cutover foundation (today)

- [ ] Export/verify a production DB backup before changes.
- [ ] Provision managed Postgres target and confirm restore.
- [ ] Provision AxTask runtime service from this repo.
- [ ] Set required environment variables:
  - `DATABASE_URL`
  - `SESSION_SECRET`
  - OAuth/env secrets in host secret manager
- [ ] Deploy AxTask and run smoke tests:
  - login
  - task create/update/complete
  - planner page load and actions
- [ ] Configure custom domain + TLS.
- [ ] Keep Replit deployment untouched as fallback.

## Day 2 -- NodeWeaver publish + monitoring + DNS finalize

- [ ] Deploy NodeWeaver from GitHub branch: <https://github.com/EndeavorEverlasting/NodeWeaver/tree/feature/axtask-contract-hardening>
- [ ] Configure same baseline (managed DB if needed, secrets, domain/TLS).
- [ ] Add uptime checks for both services.
- [ ] Add budget alerts and hard monthly guardrails.
- [ ] Finalize DNS cutover (use low TTL first).
- [ ] Validate with technicians on live flows.

---

## 4) Non-Negotiable Cost Transparency Guardrails

Before sending full production traffic:

1. Budget thresholds at **50% / 75% / 90%**.
2. Hard spending limit (or equivalent auto-protect action).
3. Daily usage digest to email/Slack.
4. Service inventory check (no orphan DB/worker/volume).
5. Autoscale floor/ceiling explicitly configured.

---

## 5) Rollback Plan (must exist before cutover)

- Keep Replit running during migration window.
- Keep DNS failback record ready for 7 days.
- Keep nightly backups in both source and target until cutover is stable.
- Document one-command rollback per service.

---

## 6) Integration Readiness Gate (for Option B)

Only merge AxTask + NodeWeaver into one runtime when all are true:

- [ ] 14 days stable operations (no sev-1 incidents)
- [ ] Known monthly baseline cost for both services
- [ ] Agreed shared auth/session model
- [ ] Clear API/data ownership map
- [ ] Rollback drill validated

---

## 7) Recommended Next Action (right now)

Start **Day 1** immediately for AxTask: backup -> new host service -> env/secrets -> deploy -> smoke tests -> domain.

This gets you off the Replit publishing chokehold today without taking unnecessary integration risk under time pressure.

## 8) NodeWeaver Branch Note (captured 2026-04-03)

Use the `feature/axtask-contract-hardening` branch as the migration input branch for NodeWeaver publishing and contract validation.

- Branch URL: <https://github.com/EndeavorEverlasting/NodeWeaver/tree/feature/axtask-contract-hardening>
- Treat this branch as source-of-truth for initial external deployment tests.
- Promote to default production branch only after smoke tests pass.

## 9) Usage Statistics + Billing Visibility (must-have before full cutover)

If you cannot see usage, billing surprises will continue. Add this minimum telemetry stack before full traffic cutover:

- [ ] Provider billing dashboard bookmarked and reviewed daily.
- [ ] Automated daily usage digest (email/Slack) with compute-hours, DB usage, and estimated month-to-date spend.
- [ ] Budget thresholds (50/75/90%) wired to real alerts (not just passive dashboard widgets).
- [ ] Uptime + request-volume dashboard (requests/day, error rate, p95 latency).
- [ ] Incident alert when usage spikes outside expected window (overnight anomaly detection).

### Suggested operational metrics

Track these every day:

1. **Traffic:** requests/min, unique active users, failed requests.
2. **Compute:** instance-hours, autoscale events, restart/crash count.
3. **Database:** connection count, CPU/storage growth, slow query count.
4. **Cost:** projected monthly spend vs budget cap.

No production cutover should be considered complete until this dashboard and alerting loop is live.
