# PR Segmentation Guide

## Purpose

Keep PRs reviewable for automated reviewers and humans by splitting large work into focused slices.

Canonical matrix reference: `docs/ACTIVE_LEGACY_INDEX.md`.

## Default Limits

- Hard CI cap: `300` files (`.github/workflows/pr-file-limit.yml`)
- Recommended cap: `200` files per PR for better automated review quality

## Helper Script

Generate split manifests from current branch:

```bash
node tools/local/split-pr-helper.mjs --base origin/main --max-files 200
```

## PR-Factor CLI (Use-Case Engine)

For use-case factoring with explicit classification + test advice:

```bash
# Full plan (scan + classify + plan artifacts)
node tools/local/pr-factor.mjs plan --base origin/main --max-files 200

# Stage commands (optional)
node tools/local/pr-factor.mjs scan --base origin/main
node tools/local/pr-factor.mjs classify --base origin/main
node tools/local/pr-factor.mjs apply --out-dir .local/pr-factor/<timestamp>
```

Generated artifacts:

- `scan.json` (changed files + hunk stats)
- `classification.json` (bucket, confidence, rationale)
- `plan.json` (slice ordering and manifests)
- `test-advice.json` (per-slice validation checks)
- `pr-plan.md`, `commands.sh`, `commands.ps1`, `part-*.txt`

For the current branch, manifests were generated at:

- `.local/pr-splits/20260408072627/part-1.txt`
- `.local/pr-splits/20260408072627/part-2.txt`
- `.local/pr-splits/20260408072627/part-3.txt`

## Mini-Games Push Recommended PR Sequence

### PR 1 - Study Data Contract

Scope:

- `shared/schema.ts`
- `migrations/0005_study_mini_games.sql`
- `shared/study-schema.test.ts`

Validation:

- `npm test -- shared/study-schema.test.ts`

### PR 2 - Study API and Storage

Scope:

- `server/storage.ts`
- `server/routes.ts`

Validation:

- Add/execute targeted server tests for new study endpoints/session transitions.

### PR 3 - Client Mini-Games UX

Scope:

- `client/src/lib/study-api.ts`
- `client/src/lib/study-api.test.ts`
- `client/src/pages/mini-games.tsx`
- `client/src/App.tsx`
- `client/src/components/layout/sidebar.tsx`

Validation:

- `npm test -- client/src/lib/study-api.test.ts`
- run additional UI tests for session interactions if route-level harness is added.

### PR 4 - Process and Infra Documentation

Scope:

- `README.md`
- `docs/README.md`
- `docs/ARCHITECTURE.md`
- `docs/DEBUGGING_REFERENCE.md`
- `docs/PR_SEGMENTATION.md`
- `.github/workflows/test-and-attest.yml`
- `.gitignore`

Validation:

- `node tools/ci/check-pr-file-count.mjs --base origin/main --max-files 300`

## Notes on Legacy NodeWeaver Backup Path

- `NodeWeaver._pre_submodule_backup` was a stale submodule gitlink; it has been **removed from the git index**. PR tooling may still exclude the path pattern for safety.
- Runtime source for integrated development is `services/nodeweaver/upstream` ([`docs/NODEWEAVER.md`](NODEWEAVER.md)).

## App-first commits vs contract-test commits (same repo, full CI on `main`)

Goal: merge **implementation** before or separately from **contract / source
assertions**, so a `git diff main -- tests/contracts` (or a PR that only
touches `**/*.test.*`) is easy to review without mixing large app refactors.

**Constraints (per team policy):**

- **`main` stays fully tested** — every push and PR still runs `npm test` and
  the existing workflow in `.github/workflows/test-and-attest.yml`. This is
  about **PR hygiene and path boundaries**, not skipping the suite on `main`.
- **Contract-style tests** (source reads, route inventories, doc anchors) may
  live under [`tests/contracts/`](../tests/contracts/) so they are not
  colocated with components. The Vitest `client-shared` project includes
  `tests/contracts/**/*.test.{ts,tsx}` (see [`vitest.config.ts`](../vitest.config.ts)).

**Suggested sequence:**

1. **PR 1 (app):** Production paths only (`client/src`, `server`, `shared`
   excluding `*.test.*` unless a minimal change is unavoidable).
2. **PR 2 (tests):** Add or move tests; for new Task List UX contracts prefer
   `tests/contracts/client/` over colocation when the test only reads source
   files or asserts static structure.

Use [`tools/local/pr-factor.mjs`](../tools/local/pr-factor.mjs) or
[`tools/local/split-pr-helper.mjs`](../tools/local/split-pr-helper.mjs) to
generate manifests from `origin/main` and keep each slice under the file cap.

## Dirty-File Curation Policy

When preparing deployment branches with existing dirty files, apply this filter in order:

1. Include files required for active runtime correctness (mini-games, NodeWeaver classifier contract, fallback orchestration).
2. Include files required for policy/tooling integrity (CI gates, segmentation tools, canonical docs).
3. Exclude unrelated feature work or legacy noise to a follow-up branch.
