# Foundry Security Insights - 2026-05-26

> **Preservation update — 2026-07-22:** This historical audit checkpoint was rebuilt on current `main` after the Replit harvest base was retired. The offline Skill Tree migration drift cited below was resolved by PR #65. The supply-chain, branch-isolation, and proof-discipline lessons remain active.

Status: preserved docs-only audit checkpoint  
Historical source branch: `docs/2026-05-26-shai-hulud-foundry-audit`  
Historical base: `audit/2026-05-04-replit-feature-harvest` at `d7041f53253067cf66b8693f4f048ae04752e201`

Timestamp discipline: every branch, commit, and PR generated from a security checkpoint should include the calendar date and proof of base/ref scope.

## Purpose

This note extends the AxTask Foundry lessons ledger with supply-chain defense posture learned during the Replit escape and feature-forensics effort.

The posture is not panic. It is quarantine-grade skepticism.

## Foundry lesson tags

### SUPPLY_CHAIN_QUARANTINE_REQUIRED

If the repo has recently used npm, Replit, unreviewed sub-REPL branches, generated code, or third-party editor extensions, do not assume the working tree or dependency tree is clean.

Required handling:

1. Treat Replit branches as evidence, not authority.
2. Treat `node_modules` as disposable.
3. Treat package lifecycle scripts as potentially hostile until reviewed.
4. Treat GitHub, npm, cloud, CI/CD, Render, Replit, and AI tooling credentials as possibly exposed if a compromised install may have run.
5. Avoid branch pushes, workflow changes, publishing, and token-generating actions until the audit gate is clean.

### TIMED_AUDIT_BRANCH_REQUIRED

Every security-sensitive branch must include a date and purpose.

Approved examples:

```text
docs/2026-05-26-shai-hulud-foundry-audit
audit/2026-05-26-npm-supply-chain-quarantine
fix/2026-05-26-ci-token-permissions-hardening
test/2026-05-26-dependency-install-script-guard
```

Rejected examples:

```text
fix-security
updates
replit-cleanup
npm-fix
```

A branch name without time and scope is fog. Fog kills audits.

### TIMED_COMMIT_REQUIRED

Commit messages for audit work must identify the scope and date.

Approved pattern:

```text
<type>(<area>): <date> <action>
```

Examples:

```text
docs(foundry): record 2026-05-26 supply-chain audit insights
docs(security): add 2026-05-26 npm quarantine guardrails
test(security): add 2026-05-26 install-script smoke guard
fix(ci): harden 2026-05-26 workflow token permissions
```

### AUDIT_APPROVED_PR_REQUIRED

Every security-sensitive PR must state:

- base branch and base SHA
- head branch and head SHA
- expected changed files
- explicit non-goals
- local or remote verification commands
- whether lifecycle scripts were run
- whether `.github/workflows`, `.replit`, `replit.nix`, package manager files, or token-bearing files changed
- STOP conditions

If the PR cannot answer those, it is not ready. It is a nice-looking trap.

### NPM_LIFECYCLE_SCRIPT_RISK

AxTask has npm lifecycle exposure because package installation can execute scripts. Even legitimate scripts create a larger blast radius during a supply-chain event.

Required posture:

- dependency installation during audit starts with `npm ci --ignore-scripts`
- postinstall behavior is rerun manually only after package, lockfile, and provenance checks
- new install scripts require their own PR and review
- lifecycle script changes must not ride inside unrelated feature PRs

### TEST_STACK_UNDOCUMENTED

The Node test stack is documented through `package.json` scripts and Vitest. The Python billing bridge test stack is separate and must not be inferred from Node proof.

Required posture:

- do not pretend Python tests are proven because Node tests pass
- document Python test dependencies before using Python checks as release evidence
- keep `.venv` isolated and prove `python` resolves inside `.venv`

### SCHEMA_MIGRATION_DRIFT

The historical offline Skill Tree finding remains a valid Foundry lesson even though its concrete migration gap was resolved by PR #65.

Required posture:

- schema changes need migration proof
- migration changes need endpoint or storage smoke proof
- Replit branch code is never proof by itself
- when a historical gap is resolved, update the audit instead of leaving stale risk language as current fact

### GH_CLI_UNAVAILABLE

If GitHub CLI is unavailable in an environment, do not hand-wave around it.

Required posture:

- use authenticated web or API evidence for PR metadata
- paste terminal proof for local state
- do not claim PR status from memory

## Quarantine gate for future repo work

Before branch creation or commits that touch dependencies, workflows, package scripts, publish settings, or security docs, run an anchor equivalent to:

```bash
printf '\n== REPO SECURITY ANCHOR ==\n'
pwd
git remote -v
git branch --show-current
git status -sb
git log --oneline --decorate -12

printf '\n== FETCH ORIGIN ONLY ==\n'
git fetch origin --prune

printf '\n== DIFF GUARD ==\n'
git diff --name-status
git diff --cached --name-status

printf '\n== CONTAMINATION PATH GUARD ==\n'
git diff --name-only | grep -E '^(\.github/workflows/|\.replit|replit\.nix|package-lock\.json|package\.json|npm-shrinkwrap\.json)$' && echo 'STOP: sensitive path changed' || echo 'OK: no sensitive path drift in working diff'
```

## STOP conditions

Stop immediately if:

- branch is not the expected branch
- base SHA is not proven
- working tree is dirty unexpectedly
- `.github/workflows`, `.replit`, or `replit.nix` appears in an unrelated feature PR
- package manager files changed without a dedicated dependency audit PR
- `node_modules` is being treated as evidence
- npm lifecycle scripts were run before audit approval
- credentials may have been exposed and have not been rotated
- Replit branch content is being merged raw

## Follow-up hardening targets

- package lifecycle-script contract tests
- dependency review checklist
- CI permissions audit
- reproducible Python billing bridge test dependencies
- package provenance policy if AxTask publishes packages
