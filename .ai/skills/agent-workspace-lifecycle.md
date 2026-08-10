authorityRef: axtask.agent-authority.v1
skillId: axtask.skill.agent-workspace-lifecycle.v1

# Agent workspace lifecycle skill

## Trigger conditions

Activate when a fresh agent needs isolation, the current worktree is dirty or conflicted outside owned scope, parallel sprints need separate writers, an agent-created worktree is found outside the managed root, cleanup of an old workspace is requested, or raw working-tree whitespace checks are being confused by CRLF/LF checkout noise.

## Required inputs

- repository root
- task/queue identifier
- owner/agent identifier
- branch and base ref
- purpose of the isolated workspace

## Procedure

1. Run `node scripts/ai-harness/workspaces.mjs doctor --strict-current`.
2. Run `node scripts/ai-harness/validate-working-diff.mjs` before treating a live working tree as whitespace-invalid. The validator keeps `git diff --cached --check` strict and uses `git diff --check --ignore-cr-at-eol` for the live working tree while reporting the workspace classifier's proven line-ending-only paths.
3. Resolve the managed sibling root with `node scripts/ai-harness/workspaces.mjs root`; an override must remain disjoint from the repository and outside temp/AppData storage.
4. Create durable isolation only through `workspaces.mjs create`; never invent an AppData/Temp path and never create a second agent-owned clone. Existing branches are resumed rather than recreated.
5. Inspect state with `workspaces.mjs list` and `workspaces.mjs doctor --strict-all`.
6. Classify before handoff using `workspaces.mjs classify --id <id> --status ACTIVE|PRESERVE|REMOVE`.
7. Use `cleanup --id <id>` only after the helper proves secondary + named branch + branch match + semantically clean + merged into freshly fetched `origin/main`.
8. Never hide staged, untracked, or semantic tracked changes. Proven CRLF↔LF-only differences on Git-attribute `text` files are non-unique checkout noise; the helper alone may use a bounded `worktree remove --force` for that exact, revalidated noise set. General force cleanup remains forbidden and branches are never deleted automatically.
9. Before PR/merge closeout, run strict committed-range whitespace proof with `git diff --check <base>...HEAD`; the working-tree exception never weakens committed changes.

## Expected outputs

- registered human-visible secondary worktree or an exact blocker
- local registry state
- strict-current/strict-all diagnostic result
- EOL-aware working-tree diff hygiene result
- sanitized operator report when needed

## Safety

Absolute personal paths and the machine-local registry are runtime evidence and must not be tracked. Temp directories may hold caches, but not unique repository state. Line-ending noise is an explicit exception only after byte-normalized comparison to the HEAD blob; it is not a blanket dirty-worktree or whitespace waiver. Do not rewrite unrelated legacy documentation merely to make a raw working-tree `git diff --check` green.
