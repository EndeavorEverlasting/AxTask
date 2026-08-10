authorityRef: axtask.agent-authority.v1
workflowId: axtask.agent-workspace-lifecycle.v1

# Agent workspace lifecycle

## Use when

Use this workflow whenever a sprint needs an isolated Git worktree, a fresh agent discovers an unmanaged secondary worktree, or an operator needs to inventory or safely retire agent workspace state.

## Inputs

- current repository root and `origin/main`
- task or queue identifier
- owner/agent identifier
- requested feature branch and purpose
- current `git worktree list --porcelain`

## Steps

1. Run `node scripts/ai-harness/workspaces.mjs doctor --strict-current` before mutation.
2. Resolve the managed root with `node scripts/ai-harness/workspaces.mjs root`. The default is the human-visible sibling `<repo-name>-worktrees`; `AXTASK_AGENT_WORKSPACE_ROOT` may override it, but the override must remain disjoint from the repository and outside temp/AppData storage.
3. For durable isolated work, use `node scripts/ai-harness/workspaces.mjs create --task <id> --owner <agent> --branch <branch> --purpose <text> --base origin/main`. Do not use a freehand `git worktree add` for agent-owned durable work and do not create a second clone. Existing local/remote branches are resumed rather than recreated.
4. Use `list` or `doctor --strict-all` to reconcile Git's worktree registry, the local AxTask workspace registry, and directories under the managed root.
5. Before stopping, classify the workspace `ACTIVE`, `PRESERVE`, or `REMOVE`. `ACTIVE` means execution continues; `PRESERVE` means unique/unmerged state must remain; `REMOVE` is only a cleanup request, not proof deletion is safe.
6. Cleanup uses `node scripts/ai-harness/workspaces.mjs cleanup --id <id>`. The command must refuse removal unless the workspace is secondary, named, branch-matched, status `REMOVE`, semantically clean, and its HEAD is already an ancestor of freshly fetched `origin/main`.
7. Semantic cleanliness is strict: staged changes, untracked files, and semantic tracked changes always block cleanup. The only dirty tracked case allowed is a proven CRLF↔LF-only difference on a path explicitly marked `text` by Git attributes. Git may require `worktree remove --force` for that checkout artifact; the helper may use force only after proving the entire dirty set is line-ending-only and revalidating HEAD, branch, and noise set immediately before removal. General force removal remains forbidden.
8. Branches are never deleted automatically. Lifecycle mutations are serialized through the machine-local workspace lock, stale locks are recovered only after owner/age checks, and Git operations use bounded timeouts.
9. Record the sanitized operator report. Never commit the machine-local registry or absolute personal paths.

## Known traps

- `AppData/Local/Temp`, `os.tmpdir()`, `/tmp`, and `/var/tmp` are scratch space, not durable sprint ownership roots.
- A pushed branch is not automatically safe to delete; cleanup requires the workspace HEAD to be merged into current `origin/main`.
- Existing AxTask history contains tracked Markdown whose checkout can appear dirty solely from CRLF/LF normalization. Never treat that as permission to ignore arbitrary dirty state; the helper proves each allowed path against the HEAD blob and `text` attribute.
- `git worktree prune` removes stale administrative records, not unique unmerged commits; never use it as proof that cleanup is safe.
- The primary checkout may live outside the managed root. Secondary agent worktrees may not. Running the helper from a secondary worktree still anchors the managed root to Git's primary worktree.
- Do not hide a separately cloned repository from the workspace registry; agent-owned durable isolation is worktree-only.

## Outputs

- machine-local workspace registry at `<managed-root>/.axtask-agent-workspaces.json`
- human inventory from `workspaces.mjs list`
- operator audit from `workspaces.mjs doctor --strict-all`
- sanitized `.ai/runs/<run-id>/agent-workspace-report.md`

## Stop conditions

A workspace-creation request succeeds only when the requested workspace exists, is registered, is usable, and is classified `ACTIVE`. A newly created `PRESERVE` workspace is an exact blocker requiring inspection; its mere existence/registration is not success. For audit/cleanup requests, stop only when strict-current or the requested cleanup gate passes, or when the helper reports an exact unsafe/unmanaged blocker. Never delete an unsafe workspace just to make validation green.

## Proof ceiling

Repository/worktree command proof only. The registry proves what the local harness observed; it does not prove another machine has no clones, folders, or unpushed state.
