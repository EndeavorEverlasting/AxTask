# Render re-entry floor — Gate G0 (July 2026)

```text
AXTASK RENDER RE-ENTRY — FLOOR BEFORE FURNITURE
Sprint: P00 — Render Re-entry Floor and Collision Audit
Branch: audit/2026-07-18-render-reentry-floor
```

## Verified floor

| Item | Value |
| --- | --- |
| Trusted remote floor | `origin/main` @ `6b2645e3e540fa6b5b847d9b7fad7a89f4909c4a` |
| Attested validated source SHA | `68720d5415f75e690f039fbd740019b86e66e95a` (from `docs/TEST_ATTESTATION.md`) |
| Relationship | `6b2645e` is a later `[skip ci]` attestation update on top of validated `68720d5`. They are **not** equivalent; attestation points at the last fully attested source commit. |
| Local primary `main` ref | Synced to `origin/main` @ `6b2645e3e540fa6b5b847d9b7fad7a89f4909c4a` via `git update-ref` (checkout unchanged; long-notes worktree preserved). |
| Audit worktree | `../AxTask-render-reentry-floor` on `audit/2026-07-18-render-reentry-floor` |

## Worktree attribution (preserved)

| Location | Branch / state | Owner | Action |
| --- | --- | --- | --- |
| `C:\Users\Cheex\Desktop\dev\AxTask` | `fix/2026-07-18-long-notes-editor` @ `bd27bb8` + untracked `artifacts/` | Waiting long-notes lane (P11 release) | Preserve; do not reset/clean |
| `AxTask-gnhf-worktrees/execute-the-ax-task-4001c4` | `gnhf/execute-the-ax-task-4001c4` @ `2cb8e9e` | GNHF / PR #81 adjacent | Preserve; not deployment |
| Audit worktree | clean for tracked intent; Windows CRLF noise on two legacy docs assumed-unchanged locally | P00 | Isolated from foreign dirt |

## Deployment authority (repository evidence only)

- **Render** is the current production deploy path (`render.yaml`, `AGENTS.md`, `AGENT_GUARDRAILS.md`).
- **Neon** is the production database / cost concern.
- `/health` is DB-free (`server/index.ts` returns JSON without querying).
- `/ready` is DB-backed (`pool.query("SELECT 1")`).
- Current `render.yaml` still sets `healthCheckPath: /ready` — routine liveness still wakes the DB until PR #75 lands.
- Production controls already on `main` (preserve; do not reverse): `SKIP_DB_PUSH_ON_START`, `DISABLE_REMINDER_DISPATCH`, `DISABLE_ARCHETYPE_ROLLUP`, `DISABLE_DB_SIZE_SNAPSHOT`, `DISABLE_OPS_SNAPSHOT`, gated `api_request` telemetry, sidebar wallet polling removed.

## Migration fact

- `migrations/0042_offline_skill_tree_tables.sql` is **absent** from current `main`.
- `scripts/migration/verify-schema.mjs` still requires `offline_skill_nodes` and `user_offline_skills`.
- **Hard collision (P01 gate):** PR #68 draft proposes `migrations/0042_provider_usage_snapshots.sql` while P01/#65 intends `migrations/0042_offline_skill_tree_tables.sql`. Same sequence number, different DDL. P01 must land offline-skill history on current `main` without absorbing #68. #68 remains quarantined (DRAFT + CONFLICTING) and must not claim `0042`.

## Live mutation rule

- Render service remains **suspended** and **untouched** through Waves 0–D.
- No Neon mutation, no `db:push` / `db:migrate` against production, no resume/deploy in this sprint.
- Repository/CI proof ≠ deployment proof.

## PR ownership and disposition

| PR | Owner sprint | Status | Dependency / disposition |
| --- | --- | --- | --- |
| #65 | **P01** | OPEN, MERGEABLE, `test-and-attest` failing (stale); ahead 1 / behind 10 vs `main` | Rebuild or prove on current `main`; owns offline-skill `0042` |
| #75 | **P02** | OPEN, MERGEABLE, checks green; 4 files; ahead 4 / behind 2 | Current-main convergence for `healthCheckPath: /health` |
| #77 | **P06** | OPEN, MERGEABLE, checks green; ahead 15 / behind 2 | Producer first; must merge before #78 |
| #78 | **P06** | OPEN, MERGEABLE, checks green; base = #77 branch; ahead 8 / behind 0 on stack | Stacked on #77; do not merge first |
| #80 | **P05** | OPEN, MERGEABLE, checks green; ahead 11 / behind 1 | Authority manifest; required before P07/P08 |
| #81 | **Waiting / non-deploy** | OPEN, MERGEABLE, `test-and-attest` failing | GNHF ops docs only; exclude from re-entry candidate |
| #58 | Evidence / redesign source | OPEN, MERGEABLE | Historical plan + early classifier; **do not wholesale merge** |
| #66 | Evidence / superseded broad recovery | OPEN, **CONFLICTING** | Broad ops recovery; treat as evidence only |
| #68 | Quarantined redesign | OPEN **DRAFT**, **CONFLICTING** | Usage-truth redesign; numbering collision on `0042`; **do not merge** |

## Waiting lanes (frozen until P11)

- `fix/2026-07-18-long-notes-editor`
- PR #67 mobile scroll/flash
- PR #81 GNHF night sprint
- Unrelated UI / Skill Tree / entourage / moderation / shortcuts / GitLab migration

## Gate checklist

### G0 — floor proven (this document)

- [x] `origin/main` at `6b2645e…` (or documented newer)
- [x] Attestation source SHA recorded separately (`68720d5…`)
- [x] Dirty work attributed or isolated
- [x] Active deploy PRs have owners
- [x] #58 / #66 / #68 classified (not silently reused)
- [x] Suspended Render remains untouched (repo action: none)
- [x] Coordination GitHub issue: https://github.com/EndeavorEverlasting/AxTask/issues/82

### G1 — deployment foundations (Parallel Group A)

- [ ] P01 migration history agrees with verifier
- [ ] P02 Render liveness uses `/health`
- [ ] P03 historical signatures reconstructed without inventing logs
- [ ] P04 local production re-entry harness
- [ ] P05 authority manifest merged or equivalently validated

### G2 — diagnostics + certification contracts

- [ ] #77 accepted, then #78 rebased/accepted
- [ ] P07 certification spine frozen

### G3 — routing

- [ ] P08 deterministic routing; live deploy remains operator-gated

### G4 — deployable candidate

- [ ] P09 **GO** on one exact SHA

### G5 — live observation

- [ ] P10 single resume + single deploy of certified SHA

## Parallel Group A ranked go/no-go

| Rank | Lane | Go/No-go | Why |
| --- | --- | --- | --- |
| 1 | **P02** (#75) | **GO** | Smallest mergeable deploy-config fix; checks green; unblocks DB-free liveness |
| 2 | **P05** (#80) | **GO** | Checks green; unlocks harness spine; no Render behavior change |
| 3 | **P01** (#65) | **GO with rebuild** | Required table drift is real; branch stale/failing; **must resolve #68 `0042` collision without merging #68** |
| 4 | **P04** (new) | **GO** | New harness; no collision with #75 health tests if separate path |
| 5 | **P03** (new) | **GO** | Docs/evidence only; reads #58/#66; must not edit classifier owned by P06 |

## Proof ceiling (P00)

Reached: **repository + GitHub evidence** (floor SHA, PR ownership, config facts).

Not reached: Render service state, Neon state, live logs (expired), deployment completion, operator acceptance.

## G0 follow-up closed (2026-07-18)

| Gap | Resolution |
| --- | --- |
| Stale local `main` @ `bc460f3` | Updated `refs/heads/main` → `6b2645e` without checking out or disturbing `fix/2026-07-18-long-notes-editor` / `artifacts/` |
| #68 vs #65 `0042` collision | Recorded as **hard P01 gate** above; #68 stays quarantined; ownership comments reinforced on #65/#68 |

## Exact next command after G0

```bash
git fetch --all --prune
```

Then launch Parallel Group A chats (P01–P05) in isolated worktrees only.
