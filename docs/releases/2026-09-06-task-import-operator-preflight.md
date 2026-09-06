# 2026-09-06 — Task import operator preflight

## Purpose

Reduce the operator work and ambiguity between a private task CSV and AxTask's spreadsheet import surface without committing private task contents to Git.

## Command

```powershell
npx tsx tools/operator/task-import-preflight.ts --file "<tasks.csv>" --expect <row-count> --sha256 <expected-sha256> --base-url "<AxTask base URL>" --open
```

The command is read-only with respect to AxTask data. It:

1. resolves the exact CSV path;
2. computes and optionally pins SHA-256;
3. parses the file with AxTask's canonical `parseTasksFromCSV` implementation;
4. validates the expected parsed row count when supplied;
5. reports logical duplicates from normalized date/time/activity/notes identity;
6. resolves the target `/import-export` URL; and
7. with `--open`, opens the import surface and highlights the selected CSV on Windows.

It does **not** upload tasks, bypass authentication, mutate a database, resume Render, or claim production acceptance.

## Identity contract

`shared/task-import-identity.ts` owns the normalized date/time/activity/notes identity parts. New operator/client comparisons use a collision-safe serialized key. `server/task-fingerprint.ts` hashes the historical pipe-joined representation of those same normalized parts so existing persisted fingerprint rows remain valid. A regression test pins the known legacy hash, preventing this refactor from silently changing server dedupe compatibility.

## Proof ceiling

Repository tests and CI can prove the parser/preflight/identity behavior. Actual account import, task persistence, production login, and live Render/Neon recovery remain runtime/operator gates governed by the production recovery runbook.
