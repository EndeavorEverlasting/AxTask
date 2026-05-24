# AxTask Replit Handoff

Timestamp UTC: 2026-05-24T012948Z

## Why this exists

The Replit terminal/session is expected to refresh. This branch preserves the current repo posture so the work can be pulled back later.

## Current facts

- PR #57 is merged into main.
- PR #62 branch was pushed locally to commit 4673343 after deleting legacy task-list shim.
- A follow-up GitHub connector patch updated PR #62 to commit f99c35559e4687af5147621797ae191d4121e9bf.
- Local gh CLI is not authenticated in Replit.
- Replit does not provide python as `python`; use `python3`, node, perl, or sed instead.
- Local Typecheck hit Node OOM unless memory is raised.
- Build passed locally.
- Tests were still failing locally before the GitHub connector patch because classification-badge tests still lacked the immersive-sounds mock.

## Recovery commands for next session

```bash
cd ~/workspace || exit 1
git fetch origin --prune

git switch fix/shared-schema-export-gaps-2026-05-23
git pull --ff-only origin fix/shared-schema-export-gaps-2026-05-23

git log --oneline --decorate --max-count=8
git status --short --branch

NODE_OPTIONS="--max-old-space-size=4096" npm run check
npm test -- client/src/components/classification-badge.test.tsx client/src/components/task-list-host.shopping.contract.test.ts server/deploy-schema-workflow.test.ts server/docker-stages.test.ts server/docker-workflow.test.ts
npm run build
```

## Do not do

- Do not merge PR #62 until GitHub checks are green.
- Do not merge harvest PR #61 into unstable main.
- Do not treat Replit local OOM as the same thing as CI Typecheck failure.
- Do not use `python`; it is absent here.
