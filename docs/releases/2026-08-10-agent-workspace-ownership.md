authorityRef: axtask.agent-authority.v1

# Agent workspace ownership harness — 2026-08-10

## Problem

Agents were correctly choosing isolated Git worktrees but were free to place durable sprint state in arbitrary machine locations such as `AppData/Local/Temp/opencode/...`. Git can enumerate registered worktrees, but humans lacked one predictable workspace root, lifecycle registry, deletion-safety rule, and doctor command. That recreates the scattered-code problem outside the repository.

## Harness change

- defines a human-visible repository-sibling managed worktree root with optional `AXTASK_AGENT_WORKSPACE_ROOT` override;
- forbids agent-owned duplicate clones and durable secondary worktrees in OS temp/AppData paths;
- adds a machine-local, untracked registry with `ACTIVE`, `PRESERVE`, and `REMOVE` lifecycle states;
- adds `workspaces.mjs` commands for root/create/list/doctor/classify/safe cleanup;
- cleanup refuses primary, dirty, unmerged, or non-REMOVE workspaces, never force-removes, and never deletes branches;
- adds workflow, skill, operator report, registry routing, hooks, focused negative tests, and dedicated CI.

## Safety / privacy

No existing worktree is deleted or moved by this harness sprint. Personal absolute paths and the machine-local workspace registry remain untracked runtime evidence. `doctor --strict-current` protects new/current work without making unrelated legacy worktree cleanup an implicit destructive side effect; operators can use `doctor --strict-all` to inventory the whole machine-visible Git worktree set.

## Proof ceiling

Repository contract and local Git-worktree behavior only. This cannot prove that another workstation has no untracked clones or folders.
