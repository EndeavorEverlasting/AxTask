authorityRef: axtask.agent-authority.v1

# Lua embedding harness boundary — 2026-08-09

## Scope

Harness infrastructure only. This change does not add a Lua runtime dependency, select a Lua adapter or JIT, change AxTask product behavior, expose host capabilities, or claim runtime proof.

## Contract established

- Lua is treated as an embedded library; the host owns the main execution loop and critical state.
- Performance-critical work remains host-owned unless benchmark evidence justifies a bounded move.
- Lua VM states must be independent, disposable, and explicitly closed by the host.
- Script errors tunnel to a host catch boundary; cleanup and rollback remain host responsibilities.
- Host functions and libraries are deny-by-default. `os` and `io` are not opened by default, and wildcard capability exposure is forbidden.
- Dynamic Lua values cross the host boundary only through explicit runtime checks and documented type contracts.
- The interpreter/explicit bytecode path is the baseline. JIT is not a default architecture decision and requires benchmark, deoptimization/stack reconstruction, and separate runtime proof.
- Lua sequence semantics remain 1-indexed; any host index translation must be explicit at the boundary.
- AI-generated snippets must remain readable, capability-declared, and reviewable without hidden runtime lookup.

## Current adoption state

`harness-only`. Product mutation remains unauthorized. The sandbox capability allowlist is intentionally empty, so this repository state proves only the integration rules and their enforcement—not the presence, safety, performance, or production behavior of a Lua runtime.

## Validation

The owning gate is:

```text
node scripts/ai-harness/validate-lua-embedding.mjs
npx --no-install vitest run server/ai-harness/lua-embedding-contract.test.ts
git diff --check
```

The dedicated `harness-lua-embedding` workflow also runs authority, harness completeness, stateful architecture, and single-fact surface validation before the focused Lua contracts.

## Proof ceiling

Harness/contract proof only. Future implementation must first name one approved stateful migration seam, an explicit host API allowlist, VM lifecycle/error cleanup semantics, and a bounded runtime validator before product code changes are authorized.
