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
2. **Operator preflight invariant:** never begin a pasted operator sequence by assuming `(git rev-parse --show-toplevel).Trim()` will succeed. When checkout identity is not already proven, route through `scripts/ai-harness/operator-preflight.ps1` or the immutable raw bootstrap form below before any repository-relative command.
3. **Repository identity is not artifact availability.** A canonical checkout may be stale, sparse, or locally missing a tracked artifact. Before invoking a tracked script, validator, workflow, or artifact, prove that the required path exists at selected HEAD **and is materialized in the selected worktree**. `git fetch` updates remote-tracking refs; it does not update the working tree. If the required artifact exists only on the intended remote SHA, or is absent from a dirty/sparse checkout, use an isolated worktree at that exact SHA rather than invoking the missing artifact.
4. From a canonical checkout whose selected worktree contains `scripts/ai-harness/resolve-checkout.mjs`, run `node scripts/ai-harness/resolve-checkout.mjs --json` for the full tracked checkout/worktree inventory.
5. If no checkout path is currently known on Windows but GitHub access is available, download only the reviewed operator bootstrap from immutable revision `698375dedc438167a11b4b38cc9730a07fb53c26`. `-EnsureArtifactWorktree` requires `-Fetch`; it reuses an already-discovered exact-`origin/main` usable checkout when possible and otherwise creates a durable sibling detached worktree at that exact SHA. The temporary bootstrap file may not own sprint state:

```powershell
$u='https://raw.githubusercontent.com/EndeavorEverlasting/AxTask/698375dedc438167a11b4b38cc9730a07fb53c26/scripts/ai-harness/operator-preflight.ps1'
$t=Join-Path $env:TEMP 'axtask-operator-preflight.ps1'
Invoke-WebRequest -UseBasicParsing $u -OutFile $t
$raw=& $t -Fetch -EnsureArtifactWorktree -Json
$r=($raw -join "`n") | ConvertFrom-Json
if(-not $r.ok){ throw $r.error }
if(-not $r.requiredArtifactAvailable){ throw "Required artifact is not available in selected worktree: $($r.requiredArtifact)" }
if([string]::IsNullOrWhiteSpace([string]$r.selected)){ throw 'No artifact-capable checkout was selected.' }
Set-Location -LiteralPath $r.selected
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
- Mutable `main` is not an acceptable acquisition source for executable bootstrap authority. Use the immutable reviewed revision embedded in this workflow, then let the bootstrap fetch `origin/main` as data to inspect/select.
- The operator bootstrap may perform a no-force `fetch origin main` when `-Fetch` is supplied. With the explicit `-EnsureArtifactWorktree` switch it may create one detached durable sibling worktree at fetched `origin/main` only when the selected checkout does not materialize the required tracked artifact. It never merges, resets, cleans, initializes, deletes, or overwrites repository state.
- The bootstrap returns structured `ok: false` evidence when no checkout is found instead of using `exit` to terminate an interactive PowerShell host.
- Without `-EnsureArtifactWorktree`, bootstrap `nextAction` refuses to enter a selected checkout that cannot materially execute the artifact and directs the operator to rerun the artifact-capable bootstrap.

## Outputs

- canonical repository identity proof or an exact no-checkout blocker
- primary checkout path plus artifact-capable `selected` checkout, optional fetched `origin/main`, and discovered checkout inventory
- required-artifact availability proof for both selected HEAD and selected worktree materialization
- sanitized `.ai/runs/<run-id>/repository-location-report.md` when needed
- one exact next repository command that uses a proven path and a worktree containing its required tracked artifact

## Stop conditions

Stop only when a canonical `EndeavorEverlasting/AxTask` checkout has been proven and the owning workflow can resume safely, or when no canonical checkout exists and the occupied-path inspection/clone decision requires operator action. Do not claim recovery from a folder name, an editor window title, a Git object that is absent from the worktree, or a worktree path copied from stale prose.

## Proof ceiling

Local Git identity, selected-HEAD plus materialized-artifact availability, and worktree-registration proof only. This workflow does not prove another machine has no clones or unpushed work, and it does not establish application, deployment, Render, Neon, or production runtime state.
