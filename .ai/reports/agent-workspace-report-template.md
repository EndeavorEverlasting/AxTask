authorityRef: axtask.agent-authority.v1

# Agent workspace operator report

## REPOSITORY
- repository: <repo-name>
- current branch: <branch>
- current HEAD: <sha>

## MANAGED ROOT
- strategy: repository-sibling or explicit environment override
- root: <redacted-or-operator-local-path>
- registry present: yes/no

## WORKSPACES
- ACTIVE: <count and sanitized IDs>
- PRESERVE: <count and sanitized IDs>
- REMOVE: <count and sanitized IDs>
- unmanaged secondary worktrees: <count>
- temp-root worktrees: <count>
- orphan directories: <count>

## DIFF HYGIENE
- working-tree validator: `node scripts/ai-harness/validate-working-diff.mjs`
- result: pass/fail
- proven CRLF/LF-only tracked paths: <count and sanitized repo-relative paths>
- semantic tracked paths: <count and repo-relative paths>
- staged whitespace errors: <none or exact diagnostics>
- committed-range `git diff --check <base>...HEAD`: <pass/fail/not-run>

## WORKING
- <what the harness can prove>

## BROKEN
- <violations or none>

## MISSING
- <missing registry/worktree/directory evidence or none>

## CLEANUP SAFETY
- safe-to-remove IDs: <ids or none>
- refused removals and reasons: <items or none>

## PROOF CEILING
Repository-local worktree evidence only; do not infer another workstation's filesystem state. EOL-aware working-tree proof does not replace strict committed-range whitespace proof.

## NEXT ACTION
- owner: <owner>
- command: <exact command>
- completion gate: <observable result>
