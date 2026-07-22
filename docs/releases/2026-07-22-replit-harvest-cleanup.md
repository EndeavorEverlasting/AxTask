# Replit Harvest Safe-Asset Cleanup

**Date:** 2026-07-22  
**Scope:** preservation-first cleanup of stale Replit harvest PR #61

## Preserved

- Local rescue logs and bundles are now explicitly ignored as export-only artifacts.
- The extraction-log handling decision is tracked without raw logs, machine paths, remotes, or export filenames.
- The attachment lightbox tolerates a missing path without opening an invalid source.
- Billing bridge dependency installation remains inside its virtual environment and now passes pip `--no-user`.
- Two dated review ledgers are retained as historical snapshots with warnings to reverify current state.

## Preserved Elsewhere

- Offline Skill Tree migration: PR #65, commit `87b2756ee703af2ed9457457aa5e2269552db345`.
- Skill Tree persistence forensics: PR #89, commit `599f8e8175796ad3b9504c1b9c9f1bdfef26872f`.
- Shared DTO export repair: PR #62.
- Legacy TaskList removal: already present on current `main`.

## Intentionally Excluded

Generated inventories and rescue proof containing environment-specific paths, remote URLs, backup filenames, cache listings, or local export artifact names were not carried into `main`.

## Proof Ceiling

Repository diff, typecheck, test, release-contract, build, and CI proof only. No Replit runtime, production deployment, live database, or operator-behavior claim.
