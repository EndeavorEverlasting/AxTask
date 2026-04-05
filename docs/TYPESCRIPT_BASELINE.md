# TypeScript baseline (`npm run check`)

**Policy:** `client/` and `shared/` must stay **clean** under `tsc`. Remaining errors are **server-side** (and migration) debt tracked here. Re-run `npm run check` after changes and update this list when the set changes.

**Last verified:** 2026-04-05 (after billing work). **Client:** no errors reported under `client/`.

## Current server / tooling errors (summary)

| Area | Files | Themes |
|------|-------|--------|
| Collaboration | `server/collaboration.ts` | Missing `@types/cookie`; `MapIterator` / `downlevelIteration` |
| Pattern engine | `server/engines/pattern-engine.ts` | `Set`/`Map` iteration; `Record<string, unknown>` vs topic types; implicit `any` in callbacks |
| Migration import | `server/migration/import.ts` | `DrizzleTable` vs `Record<string, unknown>` casts |
| Routes | `server/routes.ts` | `task` implicit `any` (~lines 1526, 1544) |

## Raw `tsc` output (reference)

When fixing debt, delete this block and replace with a fresh run.

```
server/collaboration.ts(5,20): error TS7016: Could not find a declaration file for module 'cookie'.
server/collaboration.ts(102,24): error TS2802: Type 'MapIterator<CollabClient>' can only be iterated through when using the '--downlevelIteration' flag or with a '--target' of 'es2015' or higher.
server/collaboration.ts(282,32): error TS2802: Type 'MapIterator<[WebSocket, CollabClient]>' can only be iterated through when using the '--downlevelIteration' flag or with a '--target' of 'es2015' or higher.
server/engines/pattern-engine.ts — multiple TS2802, TS2345, TS7006 (see npm run check)
server/migration/import.ts(253,22): error TS2352: Conversion of type 'DrizzleTable' to type 'Record<string, unknown>' ...
(repeated similar lines at 412, 523, 711)
server/routes.ts(1526,11): error TS7034: Variable 'task' implicitly has type 'any' in some locations where its type cannot be determined.
server/routes.ts(1544,39): error TS7005: Variable 'task' implicitly has an 'any' type.
```

## See also

- [DEBUGGING_REFERENCE.md](./DEBUGGING_REFERENCE.md) — general debugging patterns.
