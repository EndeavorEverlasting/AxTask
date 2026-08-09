authorityRef: axtask.agent-authority.v1

# Lua Embedding Integration Workflow

id: axtask.lua-embedding-integration.v1

## Trigger

Use this workflow when a task proposes Lua, LuaJIT, embedded scripting, scriptable rules, user/mod scripts, or a host-to-script runtime boundary in AxTask.

Lua is a runtime-boundary change. This workflow does not bypass `axtask.stateful-architecture-migration.v1`; it composes with it and stays inside one approved migration seam.

## Inputs

- `.ai/lua-embedding-contract.json`
- `.ai/lua-sandbox-capabilities.json`
- `.ai/stateful-surface-ledger.json`
- the current routed stateful surface artifact from `node scripts/ai-harness/next-stateful-task.mjs`
- current repo/branch/PR/collision evidence
- exact owned files and forbidden files
- required proof level and proof ceiling

## Preconditions

1. Run `node scripts/ai-harness/validate-lua-embedding.mjs`.
2. Run `node scripts/ai-harness/validate-stateful-architecture.mjs`.
3. Run `node scripts/ai-harness/validate-stateful-surface.mjs --all`.
4. If product/runtime mutation is proposed, the Lua contract must no longer be `harness-only` and the stateful ledger must authorize exactly one named migration seam.
5. In `harness-only`, product code mutation is forbidden. Harness work may refine contracts, manifests, validators, skills, reports, and evidence only.

## Factoring rules

- **Host spine:** process lifecycle, critical state, cleanup, rollback, performance-critical code, security decisions, and durable invariants stay in the host.
- **Lua scripting layer:** bounded dynamic logic that benefits from rapid change and does not need to own process or critical state.
- **Integration seam:** explicit host functions registered from `.ai/lua-sandbox-capabilities.json`; no ambient discovery or wildcard exposure.
- **Validation:** host boundary tests, sandbox negative tests, lifecycle/error-path tests, and runtime proof remain executable code, not prompt instructions.
- **Documentation/reporting:** records decisions and proof; it never substitutes for implementation.
- **Research/design:** JIT, provider/adapter choice, memory quotas, and instruction/time budgets remain unselected until evidence requires them.

When in doubt, exclude the Lua feature and keep the requirement in the host.

## Steps

1. **Resolve the exact surface.** Run the stateful router. Work on one unresolved fact or one approved migration seam only.
2. **Freeze the host/script boundary.** Write down which responsibilities stay host-owned and which one bounded responsibility is eligible for Lua.
3. **Declare capabilities before code.** Add each required host function to `.ai/lua-sandbox-capabilities.json` with owner, purpose, inputs, outputs, preconditions, forbidden behavior, guardrails, tests, and proof ceiling. An empty allowlist is correct until a function is proven necessary.
4. **Keep the host in control.** The host owns the main execution loop; scripts are invoked by the host and return or fail back to it.
5. **Isolate state.** Use independent Lua VM states for the declared sandbox/task boundary. Destroy/close the state on every success, script error, cancellation, and host failure path. Do not share mutable VM state by default.
6. **Tunnel errors to the host.** Scripts may raise errors, but the host catches them and performs cleanup/rollback before propagating or reporting the failure.
7. **Sandbox by allowlist.** Do not open OS or IO access by default. Do not provide wildcard globals, hidden host lookup, ambient filesystem/process/network access, or dynamic code loading unless separately reviewed and registered.
8. **Keep types explicit at the boundary.** Lua is dynamic; host/Lua inputs and outputs require runtime checks and a documented internal type discipline. Do not rely on implicit cross-boundary coercion.
9. **Prefer the simple execution model.** Precompiled or explicitly loaded bytecode/interpreter execution is the baseline. JIT stays disabled by default; LuaJIT requires benchmark evidence plus deoptimization/stack-reconstruction proof.
10. **Preserve Lua semantics without magic adapters.** Lua sequences are 1-indexed. Any host index translation is explicit at the boundary, not hidden in generated code.
11. **Keep AI-generated Lua auditable.** Generated snippets must declare required capabilities and remain readable without hidden metaprogramming or runtime introspection.
12. **Validate the owned seam.** Run the Lua validator, owning application tests, build, and the strongest applicable runtime proof. Never promote repository/harness proof to runtime proof.

## Validation

Harness-only baseline:

```bash
node scripts/ai-harness/validate-authority.mjs
node scripts/ai-harness/validate-harness.mjs
node scripts/ai-harness/validate-harness-infrastructure.mjs
node scripts/ai-harness/validate-stateful-architecture.mjs
node scripts/ai-harness/validate-stateful-surface.mjs --all
node scripts/ai-harness/validate-lua-embedding.mjs
npx --no-install vitest run server/ai-harness/lua-embedding-contract.test.ts
git diff --check
```

A future product implementation must also run the owning TypeScript/tests/build and runtime certification selected for the approved seam.

## Outputs

- tracked `.ai/lua-embedding-contract.json`
- tracked `.ai/lua-sandbox-capabilities.json`
- `.ai/runs/<run-id>/lua-integration-report.md`
- exact validator results
- commit/PR evidence
- one executable next action

## Stop conditions

Stop and fail closed when any of these is true:

- the task asks Lua to own the host main loop;
- product mutation is attempted while the adoption phase is `harness-only`;
- OS/IO or wildcard host exposure is proposed without a separately reviewed capability contract;
- the VM lifecycle has no explicit close/destroy path;
- a script error can bypass host cleanup or rollback;
- a performance-critical migration lacks benchmark evidence;
- JIT is enabled as a default shortcut;
- the work spans more than one stateful migration seam;
- requested proof exceeds the observed proof ceiling.

## Proof ceiling

This harness workflow can prove architecture rules, registry wiring, sandbox allowlist policy, and contract-test behavior. It cannot prove Lua is linked into AxTask, that a runtime sandbox resists hostile code, that states are freed under load, or that deployed behavior is correct. Those require implementation and runtime evidence.

## Handoff

Report the exact contract phase, current stateful surface/seam, capability manifest delta, validators run, strongest attained proof, blockers, commit/PR state, and the first executable next command. Never hand off with “implement Lua” as the next step; name the exact owned artifact or seam.

- OS and IO access remain unavailable unless a future reviewed allowlist explicitly changes the boundary.
