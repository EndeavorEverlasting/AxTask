# GitHub ↔ Replit History Sync

_Last updated: 2026-05-03_

## Background

AxTask is developed on Replit. Task agents create sprint branches, do work,
and merge into Replit's `main`. The GitHub repo
(`EndeavorEverlasting/AxTask`) mirrors this work so that pull-request history
and code reviews are preserved.

Because Replit manages its own git history (with automated checkpoint commits
not shared with GitHub), the two `main` branches can diverge over time. When
they share no common ancestor, GitHub refuses to auto-merge PRs from sprint
branches.

**What happened before this fix:**
- GitHub CI/CD added a commit (`4ea4672d`, "chore(ci): update
  TEST_ATTESTATION.md") directly to GitHub's `main`.
- Replit's `main` had a different tip with all sprint work (Tasks #28-34).
- The sprint PR (#51) had to use a workaround base branch
  (`pre-iron-spine-base`), which has now been deleted.

## The Fix (one-time, already done)

The `pre-iron-spine-base` helper branch was deleted from GitHub (Task #35).

## Keeping Things in Sync

### Method 1 — Replit Shell (simplest)

Open the Replit Shell and run:

```bash
bash scripts/sync-github.sh
```

This force-pushes Replit's `main` to GitHub's `main`. Run it after any batch
of task merges that you want to publish to GitHub.

### Method 2 — GitHub Actions (automated)

A workflow lives at `.github/workflows/replit-sync.yml`. To use it:

1. In GitHub → **Actions** → **Replit → GitHub Sync** → **Run workflow**.
2. Set `source_branch` to the branch you want to promote (default: `main`).
3. Click **Run workflow**.

Alternatively, push to the `replit/main` branch on GitHub; the workflow
triggers automatically and promotes it to `main`.

### Method 3 — Direct git (for advanced use)

```bash
git push --force origin main
```

Run from any machine with the GitHub remote configured and write access.

## Branch Naming Convention for Sprint PRs

To keep PR history clean:

| Purpose | Branch name pattern |
|---|---|
| Sprint work | `YYYY-MM-DD/sprint-name` |
| Features | `feature/short-description` |
| Hotfixes | `hotfix/short-description` |
| Replit sync trigger | `replit/main` |

## After a Sync

Once `scripts/sync-github.sh` has been run:

- GitHub `main` = Replit `main` (same SHA)
- Future sprint branches created off Replit `main` can be PR'd directly
  against GitHub `main` without workarounds
- No `--allow-unrelated-histories` flags needed

## Troubleshooting

**"Updates were rejected because the remote contains work you do not have"**
→ Use `--force`. GitHub's main may have CI-only commits that are safe to
  replace with Replit's history.

**"Permission denied" / "403"**
→ Ensure the GitHub integration in Replit is connected (Settings →
  Integrations → GitHub). The token must have `repo` write scope.

**Sprint branch PR shows "Can't automatically merge"**
→ GitHub and Replit main have diverged again. Re-run `scripts/sync-github.sh`
  and then re-open the PR.
