# Unified migration log (no features left behind)

Record operational facts here as you pin deploys and complete phases. **Do not commit secrets** (`DATABASE_URL`, API keys).

## Replit rectification commits (from dashboard screenshots)

| Short SHA | Message (summary) | Notes |
|-----------|-------------------|--------|
| **`008a8b0`** | Enhance task management with new features and UI improvements | Parent `558c1a9`. Bundles AI Planner, Community, Rewards, calendar refactor, voice, rich task form (attachments, drafts). **Must be contained in `integration/migration-unified` when present on `origin`.** |
| **`afe5210`** | Restore application functionality by reverting to a stable state | Parent **`008a8b0`**. Reset `main` toward published baseline after incomplete auto-checkpoint. **Deploy tip `D` may equal this** while tree may omit some of `008a8b0`—merge `008a8b0` explicitly if needed. |

## Deploy SHA **D** (fill in from Replit Shell)

On the **published Repl**, run:

```bash
git fetch origin && git rev-parse HEAD && git log -1 --oneline
```

| Field | Value |
|-------|--------|
| **D (full SHA)** | _paste_ |
| **D (short)** | _paste_ |
| **Recorded date** | _paste_ |

## Local clone verification (after Replit pushes to GitHub)

```powershell
cd <AxTask-repo>
git fetch origin
git show -s --oneline 008a8b0
git show -s --oneline afe5210
git branch -a --contains 008a8b0
git branch -a --contains afe5210
```

If `unknown revision`, push the Replit branch to `origin` first, then re-fetch.

## Integration tip **U**

| Field | Value |
|-------|--------|
| Branch name | `integration/migration-unified` |
| Tip SHA after merge (local) | Run `git rev-parse HEAD` on `integration/migration-unified` |
| Tag (optional) | `migration-unified-YYYY-MM-DD` |

## Branch tips at last doc update

Run: `git fetch origin && git rev-parse --short experimental/next origin/main origin/replit-published-preproduction-clean`

- This workspace merged **`origin/replit-published-preproduction-clean`** into **`integration/migration-unified`** from **`experimental/next`** so Replit-only history present on GitHub is combined with admin features. When **`008a8b0`** appears on `origin`, merge or cherry-pick it into **`integration/migration-unified`** if not already an ancestor.
