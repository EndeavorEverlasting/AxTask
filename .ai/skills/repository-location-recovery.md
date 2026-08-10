authorityRef: axtask.agent-authority.v1
skillId: axtask.skill.repository-location-recovery.v1

# Repository location recovery skill

## Trigger conditions

Activate when `git rev-parse`, `git status`, `git worktree`, or another repository-relative command fails because the current directory is not a Git checkout, when a directory is named AxTask but its repository identity is unproven, or when a shell/editor restart makes the active checkout uncertain.

## Required inputs

- observed current directory
- expected repository identity `EndeavorEverlasting/AxTask`
- one or more deliberate development roots when the defaults are insufficient

## Procedure

1. Preserve the suspicious directory exactly as found. Do not initialize, clean, reset, rename, delete, or overwrite it.
2. Run `node scripts/ai-harness/resolve-checkout.mjs --json` from a canonical checkout, or use the documented temporary bootstrap invocation when no checkout path is known.
3. Trust only candidates whose Git top-level resolves and whose `origin` matches the canonical AxTask repository.
4. Use the returned `primary` checkout for read/fetch operations. Treat `main` as optional; branch `main` does not need to be checked out just to fetch `origin/main`.
5. For mutation, run the workspace lifecycle doctor and create/resume managed isolation through `workspaces.mjs`; do not create ad hoc Temp/AppData worktrees or a second clone as an isolation shortcut.
6. If no canonical checkout exists, inspect the occupied expected path before deciding whether a new durable clone is safe.
7. Record the exact recovered path only in runtime/operator evidence, not tracked repository prose.

## Expected outputs

- canonical AxTask checkout path or exact no-checkout blocker
- origin, HEAD, branch/detached state, and registered worktree evidence
- first safe command for the owning workflow

## Safety

A path name is not repository identity. Do not chain commands after a failed path-resolution expression: null/empty variables can cause later Git arguments to be misparsed and create misleading errors. Temporary bootstrap tooling is disposable and may never own unique sprint state.
