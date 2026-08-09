authorityRef: axtask.agent-authority.v1

# Lua Embedding Integration Skill

id: axtask.skill.lua-embedding-integration.v1

## Use when

A task mentions Lua, LuaJIT, embedded scripting, scriptable rules, mod/user scripts, a Lua VM, sandboxed scripts, or exposing host functions to a script runtime.

## Required inputs

- `.ai/lua-embedding-contract.json`
- `.ai/lua-sandbox-capabilities.json`
- current stateful ledger + routed surface artifact
- exact owned scope and forbidden scope
- current branch/PR/collision evidence
- required proof and proof ceiling

## Procedure

1. Validate the Lua contract before editing.
2. Validate the stateful architecture contract and run the single-fact router.
3. If the Lua contract is `harness-only`, do not touch product/runtime code.
4. Identify one bounded host/script seam. Keep process lifecycle, critical state, rollback, cleanup, security decisions, and performance-critical work in the host.
5. Register only the host functions that seam actually needs. Every function requires explicit inputs/outputs, preconditions, forbidden behavior, guardrails, tests, and proof ceiling.
6. Keep `os` and `io` unavailable by default; reject wildcard/ambient exposure.
7. Require independent VM states at the declared isolation boundary and an explicit close/destroy path on every exit.
8. Require script errors to be caught by the host before cleanup/rollback and propagation.
9. Require runtime type checks at every host/Lua boundary and document the internal type discipline.
10. Prefer interpreter/explicit bytecode execution. Treat JIT as a separate optimization sprint with benchmark and deoptimization proof.
11. Preserve Lua 1-indexed sequence semantics; any host translation must be explicit.
12. Keep generated Lua readable and capability-declared; reject hidden host lookup or prompt-only application behavior.
13. Run the Lua validator, owning tests/build, and strongest applicable runtime proof.
14. Produce the Lua integration report and exact next command.

## Guardrails

- Lua is a library embedded by the host, not the owner of the host process.
- `harness-only` means no product mutation authorization.
- Stateful/serverless migration rules still apply; one approved seam per sprint.
- Independent VM states are the default isolation model.
- VM state cleanup is mandatory on success and failure paths.
- Script errors may be raised; the host must catch them.
- OS and IO access are deny-by-default.
- Host function exposure is allowlist-only and individually auditable.
- Dynamic typing does not excuse undocumented boundary types.
- JIT is not a default architecture requirement.
- When in doubt, leave a feature out of Lua and keep it in the host.
- AI-generated snippets must be readable, non-magical, and reviewable.
- Harness proof is not runtime proof.

## Outputs

- validated Lua embedding contract
- validated sandbox capability manifest
- one bounded implementation seam or a fail-closed harness-only decision
- `.ai/runs/<run-id>/lua-integration-report.md`
- exact validator/build/runtime evidence
- commit/PR state and one executable next command

## Proof rules

Contract validation proves the repository enforces Lua design rules. Static tests prove code contracts. Build proves buildability. Sandbox effectiveness, VM cleanup under load, caught errors, and behavior require an actual runtime. Live behavior requires protected live evidence. Never promote proof.
