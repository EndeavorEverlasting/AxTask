authorityRef: axtask.agent-authority.v1
skillId: axtask.skill.agent-workspace-lifecycle.v1

# Agent workspace lifecycle skill

## Trigger conditions

Activate when a fresh agent needs isolation, the current worktree is dirty or conflicted outside owned scope, parallel sprints need separate writers, an agent-created worktree is found outside the managed root, or cleanup of an old workspace is requested.

## Required inputs

- repository root
- task/queue identifier
- owner/agent identifier
- branch and base ref
- purpose of the isolated workspace

## Procedure

1. Run `node scripts/ai-harness/workspaces.mjs doctor --strict-current`.
2. Resolve the managed sibling root with `node scripts/ai-harness/workspaces.mjs root`.
3. Create durable isolation only through `workspaces.mjs create`; never invent an AppData/Temp path and never create a second agent-owned clone.
4. Inspect state with `workspaces.mjs list` and `workspaces.mjs doctor --strict-all`.
5. Classify before handoff using `workspaces.mjs classify --id <id> --status ACTIVE|PRESERVE|REMOVE`.
6. Use `cleanup --id <id>` only after the helper proves clean + merged + secondary. Never pass force flags and never delete the branch automatically.

## Expected outputs

- registered human-visible secondary worktree or an exact blocker
- local registry state
- strict-current/strict-all diagnostic result
- sanitized operator report when needed

## Safety

Absolute personal paths and the machine-local registry are runtime evidence and must not be tracked. Temp directories may hold caches, but not unique repository state.
