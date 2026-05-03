# Production migration — branch comparison (admin box)

**Generated from repo state.** Re-run [scripts/migration/compare-migration-refs.ps1](../scripts/migration/compare-migration-refs.ps1) after `git fetch` to refresh SHAs.

## What is a “deploy SHA,” and where do you find it?

**Deploy SHA** means: the **Git commit ID** (40-character hex, or the first 7+ characters—e.g. `b8068c0`) of the **exact code snapshot** that your host used to **build and run** the app users hit today. Your database was created and migrated by **that** code’s schema, so you need that ID to line up **branches** with **production**.

It is **not** stored inside this repo automatically. You get it from **where the app is hosted**, or from **Git in the same checkout the host deploys from**.

### If the live app is on Replit (Autoscale / Deployments)

1. Open the **Repl** that powers the published app (the one connected to your GitHub repo or Replit’s copy).
2. **Deployments / Autoscale / Publish** area (Replit’s UI moves; look for **Deployment history**, **Builds**, or **Published app** for that Repl).
3. Open the **latest successful deployment** and look for a line like **Commit**, **Git SHA**, **Revision**, or **Source**—copy that value.
4. If the UI does not show it: open the **Shell** in **that** Repl, run:
   ```bash
   git fetch origin && git rev-parse HEAD && git log -1 --oneline
   ```
   That prints the commit at the tip of whatever branch the Repl has checked out **after** it pulled. That is your deploy SHA **only if** this Repl is what actually gets published (no manual drift, no uncommitted changes).

### If the live app is on Render

1. **Render Dashboard** → your **Web Service** for AxTask.
2. **Events** or **Deploys** tab → click the latest deploy.
3. Render usually shows the **commit** from the connected GitHub branch (click through to the commit on GitHub to see the full SHA).

### If the live app is on Railway, Fly.io, or similar

Use that product’s **Deployments** / **Releases** page for the service; they almost always show **Commit** or link to GitHub.

### Why it matters here

Once you have that string, compare it to:

```powershell
git fetch origin
git rev-parse --short origin/replit-published-preproduction-clean
git rev-parse --short origin/baseline/published
git rev-parse --short experimental/next
```

- If the deploy SHA **matches** one of those tips, that ref is your **P** (published baseline).
- If it **matches none**, search: `git branch -a --contains <full-sha>` (or look up the commit on GitHub) to see which branch contains it, then create or move `baseline/published` to **that** commit with [scripts/migration/create-baseline-published.ps1](../scripts/migration/create-baseline-published.ps1).

## TL;DR

| Ref | Tip (short) | Role |
|-----|-------------|------|
| **`main`** | same as `experimental/next` | No diff vs experimental today — both are **E**. |
| **`experimental/next`** | **E** | Target app + schema after restore + `db:push` / migrations. |
| **`origin/replit-published-preproduction-clean`** | **P₁** | Candidate “clean” Replit publish line (see divergence below). |
| **`baseline/published`** (local) | should match **P₁** | Frozen baseline; **do not** fast-forward to `origin/baseline/published` without review. |
| **`origin/baseline/published`** | **P₂** | **Suspect:** Replit pushed unrelated work (forum, “Published your App”, etc.). Treat as **not** trusted for **P** until you confirm it matches what actually runs in production. |

**Critical:** **P₁** (`b8068c0`) and **E** (`5b4ea92`) are **not** in a straight parent line. They share merge-base `09915261` but each has commits the other does **not**. Restoring a DB from production and applying only **E**’s schema is wrong **if** production was built from **P₁** and the DB contains tables/columns only present in **P₁**’s schema — you must **confirm the deploy SHA** (see section above) and either merge the missing code path or plan an explicit schema/data bridge.

## Resolved SHAs (verify after fetch)

Run:

```powershell
git fetch origin
git rev-parse --short main experimental/next origin/replit-published-preproduction-clean baseline/published origin/baseline/published
```

## `main` vs `experimental/next`

Identical tips → **empty diff**. Use either as **E**; keep `experimental/next` as the named integration branch for migration docs.

## `replit-published-preproduction-clean` vs `experimental/next` (P₁ vs E)

- **Schema:** large delta in `shared/schema.ts` (hundreds of lines). **E** adds MFA, notifications, security ledger, premium tables, attachments, billing helpers, etc. **E** also **removes** some **P₁** concepts in schema (e.g. `task_collaborators`, `recurrence` on tasks, replaces `task_patterns` with offline-generator tables — verify against **real** prod DB before applying `db:push`).
- **History:** symmetric divergence from `09915261`:
  - Commits reachable from **P₁** but not **E** include migration toolkit work, tutorial/dictation/sidebar commits (see `git log --oneline experimental/next..origin/replit-published-preproduction-clean`).
  - Commits reachable from **E** but not **P₁** are the ~20 “admin box” features (MFA, Docker, notifications, premium foundations, etc.).

**Restore order (unchanged from plan):** backup/restore **production Postgres** → upgrade schema from **actual prod** shape to **E** → deploy **E**. If prod DB was created under **P₂** or **P₁**, introspect prod (or restore to staging) before trusting a blind `db:push` from **E**.

## `baseline/published` (local) vs `origin/baseline/published` (P₂)

Local `baseline/published` was created at **P₁** (`b8068c0`). Remote `origin/baseline/published` has moved to **P₂** (`17c7f8a` at time of report) with many commits **not** in **E** (forum, reactions, NodeWeaver dispute flow, repeated “Published your App”, …).

**Recommendation:**

1. **Do not** assume `origin/baseline/published` == production without verifying the running deploy SHA.
2. To **reclaim** the branch name on the remote (optional): after team agreement, reset `baseline/published` to verified **P** and `git push --force-with-lease origin baseline/published`.
3. Until then, use **`origin/replit-published-preproduction-clean`** plus **host dashboard SHA** as **P**.

## Commands used for review

```powershell
git fetch origin
git log --oneline origin/replit-published-preproduction-clean..experimental/next
git log --oneline experimental/next..origin/replit-published-preproduction-clean
git log --oneline experimental/next..origin/baseline/published
git diff origin/replit-published-preproduction-clean..experimental/next -- shared/schema.ts
git diff origin/baseline/published..experimental/next -- shared/schema.ts
```

## Next steps (operational)

1. Read **deploy commit** from Replit / Autoscale / hosting (build id, release tab, or `git rev-parse` in the deployment workspace).
2. If that SHA equals **P₂**, diff **P₂** vs **E** and merge or cherry-pick anything prod DB still needs before schema upgrade.
3. Staging: restore prod dump → introspect tables → run schema upgrade to **E** → full regression.
4. Attachments: sync `storage/attachments` (or volume) if prod uses local disk paths referenced in DB.
