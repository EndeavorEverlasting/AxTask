authorityRef: axtask.agent-authority.v1

# EOL-aware working diff hygiene

Date: 2026-08-10

## Problem

A fresh Windows checkout can contain inherited Markdown whose working-tree bytes differ from the indexed blob only by CRLF/LF conversion. Running raw `git diff --check` against that live checkout can surface pre-existing trailing whitespace in those legacy files and abort an otherwise clean operator workflow. This was observed after the agent-workspace harness merged: the workspace contract and harness completeness validators passed, while raw working-tree `git diff --check` failed on `docs/CHANGELOG.md` and `docs/VERSION_1.3.0_PLAN.md`.

## Harness change

- added `scripts/ai-harness/validate-working-diff.mjs`;
- kept staged whitespace proof strict with `git diff --cached --check`;
- uses the workspace cleanliness classifier to partition unstaged tracked paths into semantic changes versus proven CRLF/LF-only checkout noise;
- runs `git diff --check --ignore-cr-at-eol -- <semantic-paths...>` only for semantic tracked paths, so legacy trailing spaces in EOL-only checkout noise cannot masquerade as newly introduced defects;
- reports the excluded line-ending-only paths explicitly;
- keeps semantic tracked whitespace failures strict;
- records the split in the agent-workspace contract/schema, workflow, skill, report, README, pre-commit hook, focused tests, and dedicated CI;
- retains strict `git diff --check <base>...HEAD` for committed PR/branch ranges.

## Review hardening

Automated review correctly identified that `--ignore-cr-at-eol` alone is insufficient: `git diff --check` may still diagnose inherited trailing spaces on converted lines. The repair therefore excludes only the paths independently proven EOL-only and adds focused negative routing tests proving semantic paths remain in the Git whitespace check.

## Safety

This change does not normalize, rewrite, or waive the legacy documentation. It does not ignore staged whitespace errors or semantic tracked changes. The working-tree exception exists only to prevent checkout EOL conversion from being mistaken for newly introduced repository whitespace defects.

## Proof ceiling

Repository/harness proof only. The dedicated workspace CI and full repository CI must still validate the exact feature head before merge. A passing EOL-aware working-tree check does not prove another workstation has no untracked or unregistered state.
