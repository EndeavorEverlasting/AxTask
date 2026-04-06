# TypeScript baseline (`npm run check`)

**Policy:** `client/` and `shared/` must stay **clean** under `tsc`. Remaining errors are **server-side** (and migration) debt tracked here. Re-run `npm run check` after changes and update this list when the set changes.

**Last verified:** 2026-04-06. **Client:** no errors reported under `client/`. **Full project:** `npm run check` exits 0 (no `tsc` diagnostics).

## Current server / tooling errors (summary)

| Area | Files | Themes |
|------|-------|--------|
| — | — | No outstanding errors in the last verification run. |

## Raw `tsc` output (reference)

When fixing debt, delete this block and replace with a fresh run.

```text
(complete stdout from `npm run check` / `npx tsc` on 2026-04-06 — empty; exit code 0)

server/engines/pattern-engine.ts — no diagnostics (TS2802 / TS2345 / TS7006 not reported in this run).

server/collaboration.ts — no diagnostics (TS2802 MapIterator iteration not reported; workspace `tsconfig.json` uses `"target": "ES2022"` aligned with AxTask).
```

## See also

- [DEBUGGING_REFERENCE.md](./DEBUGGING_REFERENCE.md) — general debugging patterns.
