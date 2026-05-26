# Foundry Security Insights - 2026-05-26

Status: docs-only audit checkpoint
Branch: `docs/2026-05-26-shai-hulud-foundry-audit`
Base: `audit/2026-05-04-replit-feature-harvest` at `d7041f53253067cf66b8693f4f048ae04752e201`
Timestamp discipline: every branch, commit, and PR generated from this checkpoint must include the calendar date and proof of base/ref scope.

## Purpose

This note extends the AxTask Foundry lessons ledger with supply-chain defense posture learned during the Replit escape and feature-forensics effort.

The current posture is not panic. It is quarantine-grade skepticism.

## New Foundry lesson tags

### SUPPLY_CHAIN_QUARANTINE_REQUIRED

If the repo has recently used npm, Replit, unreviewed sub-REPL branches, generated code, or third-party editor extensions, do not assume the working tree or dependency tree is clean.

Required handling:

1. Treat Replit branches as evidence, not authority.
2. Treat `node_modules` as disposable.
3. Treat package lifecycle scripts as potentially hostile until reviewed.
4. Treat GitHub, npm, cloud, CI/CD, Render, Replit, and AI tooling credentials as possibly exposed if a compromised install may have run.
5. Avoid all branch pushes, workflow changes, publishing, and token-generating actions until the audit gate is clean.

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

- dependency install during audit starts with `npm ci --ignore-scripts`
- any postinstall behavior is rerun manually only after package, lockfile, and provenance checks
- new install scripts require their own PR and review
- lifecycle script changes must not ride inside feature PRs

### TEST_STACK_UNDOCUMENTED

The Node test stack is documented through `package.json` scripts and Vitest. The Python billing bridge test stack remains a separate risk if pytest or equivalent test dependencies are not declared and reproducible.

Required posture:

- do not pretend Python tests are proven because Node tests pass
- document Python test dependencies before using Python checks as release evidence
- keep `.venv` isolated and prove `python` resolves inside `.venv`

### SCHEMA_MIGRATION_DRIFT

The offline Skill Tree finding remains a valid Foundry lesson: schema definitions and migration history can drift apart during feature recovery.

Required posture:

- schema changes need migration proof
- migration changes need endpoint or storage smoke proof
- Replit branch code is never proof by itself

### GH_CLI_UNAVAILABLE

If GitHub CLI is unavailable in the environment, do not hand-wave around it.

Required posture:

- use web or API proof for PR metadata
- paste terminal proof for local state
- do not claim PR status from memory

## Quarantine gate for future repo work

Before any branch creation or commit that touches dependencies, workflows, package scripts, publish settings, or security docs, run an anchor equivalent to:

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
- `.github/workflows`, `.replit`, or `replit.nix` appears in a feature PR
- package manager files changed without a dedicated dependency audit PR
- `node_modules` is being treated as evidence
- npm lifecycle scripts were run before audit approval
- credentials may have been exposed and have not been rotated
- Replit branch content is being merged raw

## Immediate next documentation target

Create a dedicated security doctrine document covering Shai-Hulud-style npm and developer-tooling supply-chain compromise prevention.

That document should define:

- safe npm install mode
- dependency cooldown policy
- credential rotation policy
- workflow and token restrictions
- branch, commit, and PR naming rules
- no-raw-Replit merge rule
- audit-only recovery procedure
