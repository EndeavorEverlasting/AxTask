# PR #62 Recovery Anchor - 2026-05-24

This branch preserves a known GitHub-pullable recovery point for the AxTask deployment/typecheck convergence workflow after the Replit terminal/session refreshed.

## Anchor

- Recovery branch: `state/axtask-pr62-recovery-anchor-2026-05-24`
- Anchored commit: `f99c35559e4687af5147621797ae191d4121e9bf`
- PR branch: `fix/shared-schema-export-gaps-2026-05-23`
- PR: #62, `Fix shared schema DTO export gaps`

## What survived from Replit

- PR #62 was updated remotely through commit `4673343d17eeb16532bffbb6c31d921d5940221f`, deleting the legacy `client/src/components/task-list.tsx` shim.
- A GitHub connector patch then added `vi.mock("@/hooks/use-immersive-sounds", ...)` to `client/src/components/classification-badge.test.tsx`, producing commit `f99c35559e4687af5147621797ae191d4121e9bf`.
- Local Replit `gh` was not authenticated.
- Replit did not expose `python`; use `python3`, `node`, `perl`, or `sed` for patch scripts.
- Replit local `npm run check` hit Node OOM without more memory, but GitHub Actions Typecheck passed.

## Latest known CI posture for PR #62 at `f99c355`

Passing:

- `production-startup-guard`
- `pr-file-limit`
- `Security - Axios Guard`
- `docker-build`
- `check-nodeweaver-file`
- `Typecheck` inside `test-and-attest`

Failing:

- `test-and-attest` fails at `Run tests`.

Current failing test buckets:

1. `client/src/components/classification-badge.test.tsx`
   - Old expectations no longer match current component output.
   - The button no longer has `title="Classify to earn coins"`; query by role/text or `button` instead.
   - The onboarding hint text does not render in the current branch.
   - The editable badge renders one chevron icon, not pencil plus chevron.

2. `server/deploy-schema-workflow.test.ts`
   - Stale test still expects Dockerfile inline shell CMD.
   - PR #57 intentionally moved Docker startup to `CMD ["node", "scripts/production-start.mjs"]`.

3. `server/docker-stages.test.ts`
   - Stale expectations still look for copying only `scripts/apply-migrations.mjs` and old shell CMD.
   - Dockerfile now copies `/app/scripts ./scripts` and validates `production-start.mjs`, env check, DB capacity check, migrations, and migration airlock.

4. `server/docker-workflow.test.ts`
   - Stale expectation still looks for inline `node scripts/apply-migrations.mjs`, `drizzle-kit push --force`, and `node dist/index.js` in Dockerfile.
   - Correct model is Dockerfile delegates runtime sequencing to `scripts/production-start.mjs`.

## New PC recovery commands

```bash
cd ~/workspace || exit 1

git fetch origin --prune

git switch fix/shared-schema-export-gaps-2026-05-23 || \
  git switch -c fix/shared-schema-export-gaps-2026-05-23 origin/fix/shared-schema-export-gaps-2026-05-23

git pull --ff-only origin fix/shared-schema-export-gaps-2026-05-23

git log --oneline --decorate --max-count=10
git status --short --branch
```

## Validation commands

```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run check

npm test -- \
  client/src/components/classification-badge.test.tsx \
  server/deploy-schema-workflow.test.ts \
  server/docker-stages.test.ts \
  server/docker-workflow.test.ts

npm run build
```

## Decision rule

- Do not merge PR #62 until `test-and-attest` is green.
- Do not merge harvest PR #61 while main deployability is still unproven.
- Do not merge PR #60; it is superseded by merged PR #57.
- PRs #58 and #59 should be converged only after PR #62/main is clean.
