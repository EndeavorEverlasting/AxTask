authorityRef: axtask.agent-authority.v1
workflowId: axtask.repository-location-recovery.v1

# Repository location recovery

## Use when

Use this workflow when the shell prompt, editor, shortcut, or copied command claims to be in AxTask but `git rev-parse`, `git status`, `git worktree`, or another repository-relative command reports that the current directory is not a Git repository, or when the active checkout/worktree identity is uncertain.

## Inputs

- observed current directory
- expected repository identity `EndeavorEverlasting/AxTask`
- durable search roots such as `Desktop/Dev`, `Desktop/dev`, or another operator-declared development root
- current machine Git worktree registrations, if any canonical checkout can be found

## Steps

1. Do not run `git init`, reset, clean, delete, rename, or overwrite the suspicious directory.
2. **Operator preflight invariant:** never begin a pasted operator sequence by assuming `(git rev-parse --show-toplevel).Trim()` will succeed. When checkout identity is not already proven, route through `scripts/ai-harness/operator-preflight.ps1` or the raw bootstrap form below before any repository-relative command.
3. **Repository identity is not artifact availability.** A canonical checkout may be stale. Before invoking a tracked script, validator, workflow, or artifact, prove that the required path exists at the selected checkout HEAD. `git fetch` updates remote-tracking refs; it does not update the working tree. If the required artifact exists only on the intended remote SHA, use an isolated worktree at that exact SHA rather than invoking the missing artifact from the stale checkout.
4. From a canonical checkout whose selected HEAD contains `scripts/ai-harness/resolve-checkout.mjs`, run `node scripts/ai-harness/resolve-checkout.mjs --json` for the full tracked checkout/worktree inventory.
5. If no checkout path is currently known on Windows but GitHub access is available, download only the tracked operator bootstrap into temporary tooling, run it with `-Fetch -Json`, validate its result, and use its `primary` checkout. The temporary file may not own sprint state:

```powershell
$u='https://raw.githubusercontent.com/EndeavorEverlasting/AxTask/main/scripts/ai-harness/operator-preflight.ps1'; $t=Join-Path $env:TEMP 'axtask-operator-preflight.ps1'; Invoke-WebRequest -UseBasicParsing $u -OutFile $t; $raw=& $t -Fetch -Json; $r=($raw -join "`n")|ConvertFrom-Json; if(-not $r.ok){throw $r.error}; Set-Location -LiteralPath $r.primary
```

6. Accept a candidate only when Git resolves a top-level directory and its `origin` matches `EndeavorEverlasting/AxTask`. A directory name such as `AxTask` is not proof.
7. Inspect the resolver's `primary`, optional `main`, `current`, and `worktrees` fields. Do not require branch `main` to be checked out merely to fetch or inspect `origin/main`.
8. If a canonical checkout exists, run repository commands with `git -C <resolved-path> ...` or change directory to that proven path. For mutation requiring isolation, return to `axtask.agent-workspace-lifecycle.v1` and use `workspaces.mjs create`.
9. If no canonical checkout exists, inspect the occupied expected path for unique operator files before cloning. Never convert an arbitrary occupied directory into a repository just to make the error disappear.
10. Capture a sanitized repository-location report when the recovery is operationally significant. Absolute personal paths are runtime evidence and remain untracked.
11. After recovery, run `node scripts/ai-harness/workspaces.mjs doctor --strict-current`, then resume the owning workflow.

## Known traps

- `C:\Users\<user>\Desktop\Dev\AxTask` can exist as a normal folder without containing `.git`; the shell prompt alone proves nothing.
- `Desktop\Dev`, `Desktop\dev`, `<home>\dev`, and editor-created workspaces may look similar while resolving to different directories.
- A failed `$Start=(git rev-parse --show-toplevel).Trim()` leaves `$Start` null; subsequent `git -C $Start ...` commands can reinterpret later arguments as paths and produce misleading secondary failures.
- `git worktree list` cannot bootstrap from a non-repository directory. First locate one canonical checkout, then ask Git for its registered worktrees.
- No checked-out `main` worktree is not itself an error. `origin/main` can be fetched from another canonical checkout, and mutation should use managed isolation when appropriate.
- Temporary downloaded bootstrap/resolver code may help locate a durable checkout, but `%TEMP%`, AppData, `/tmp`, and `/var/tmp` must never become the owner of unique sprint state.
- The operator bootstrap may perform a no-force `fetch origin main` when `-Fetch` is supplied; it never merges, resets, cleans, initializes, or deletes repository state.
- The bootstrap returns structured `ok: false` evidence when no checkout is found instead of using `exit` to terminate an interactive PowerShell host.

## Outputs

- canonical repository identity proof or an exact no-checkout blocker
- primary checkout path, optional checked-out `main` path, current checkout identity, and Git worktree inventory
- sanitized `.ai/runs/<run-id>/repository-location-report.md` when needed
- one exact next repository command that uses a proven path

## Stop conditions

Stop only when a canonical `EndeavorEverlasting/AxTask` checkout has been proven and the owning workflow can resume safely, or when no canonical checkout exists and the occupied-path inspection/clone decision requires operator action. Do not claim recovery from a folder name, an editor window title, or a worktree path copied from stale prose.

## Proof ceiling

Local Git identity and worktree-registration proof only. This workflow does not prove another machine has no clones or unpushed work, and it does not establish application, deployment, Render, Neon, or production runtime state.
