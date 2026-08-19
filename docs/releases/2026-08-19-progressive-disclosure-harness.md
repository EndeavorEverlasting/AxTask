# Progressive disclosure harness factoring — 2026-08-19

## Scope

Repository harness/spec information architecture only. Product behavior, production provider state, runtime configuration, database contents, and unrelated documentation are unchanged.

## Three-layer contract

- **50k orientation:** `.ai/README.md` only; app purpose, major domains, canonical entrypoints, first commands, proof boundary, and drill-down routes.
- **30k domain:** one file under `.ai/domains/`; responsibilities, boundaries, owning contracts, workflow/validator/artifact IDs, and conditional drill-down links only.
- **15k workflow:** `show-context.mjs workflow <id>` renders one workflow spec, required skill/contract/schema files, shared failure/handoff contracts, and projected validator/artifact records by ID. Whole registries, unrelated domains, history, and large implementation files remain on demand.

## Before measurements

No tokenizer was available, so estimates use UTF-8 bytes / 4.

| Retrieval simulation | Default files before | Bytes | Estimated tokens |
|---|---:|---:|---:|
| What is this app and how is it organized? | AGENTS + guardrails + `.ai/README` + queue + authority + harness + codebase map | 71,972 | 17,993 |
| How does the repository harness domain work? | `.ai/README` + authority + harness + codebase/artifact/capability maps | 57,362 | 14,341 |
| How do I run local deployment certification? | workflow + skills + runtime schema + whole workflow/validator/artifact/trigger registries | 42,121 | 10,531 |

These simulations reflect the documented pre-factor loading pattern, not repository total size. The path-level baseline inventory (purpose, owner, load trigger, size, overlap, and consumer) is preserved at `.ai/reports/progressive-disclosure-baseline-20260819.json` and is demand-loaded evidence, not an entry-path dependency.

## After measurements

The dedicated CI workflow runs the same three queries through `show-context.mjs --measure`.

| Retrieval simulation | Bytes after | Estimated tokens after | Reduction |
|---|---:|---:|---:|
| What is this app and how is it organized? | 2,507 | 627 | 96.5% |
| How does the repository harness domain work? | 3,229 | 808 | 94.4% |
| How do I run local deployment certification? | 15,112 | 3,778 | 64.1% |

The full route validator reports `orientation=627`, `max-domain=808`, and `max-workflow=3888` estimated tokens, so all 50k / 30k / 15k bundles stay within their 1,000 / 2,000 / 4,000 soft ceilings without exceptions.

## Enforcement

`node scripts/ai-harness/validate-progressive-disclosure.mjs` fails when a route is broken, a registered workflow is unrouted, a domain owner has no load condition, a validator/artifact ID is unresolved, an unrelated domain leaks into a selected domain bundle, authority anchors disappear, a routed path resolves outside the real checkout, or a context bundle exceeds its budget without a structured, scoped, authority-referenced, unexpired safety exception. Stale exceptions on in-budget bundles also fail. The validator is registered in `.ai/validator-registry.json`; its contract test, dedicated CI workflow, and pre-push gate prevent silent re-bloat.

High-risk PR closeout now conditionally routes `docs/GIT_BRANCHING_AND_DEPLOYMENT.md`, and CI polling during closeout routes `docs/CI_POLLING_FOR_AGENTS.md`, preserving those removed universal rules without loading them by default.

Legacy workspace and repository-location validators were also factored so they continue to prove their full workflow/skill/runtime safety contracts while requiring only routing/drill-down markers at 50k. Their procedure text remains demand-loaded at 30k/15k.

## Authority and proof ceiling

`AGENTS.md` retains universal governance and machine-authority anchors; unique domain rules remain owned by their existing canonical documents and are routed from the relevant 30k map or selected workflow. Repository/CI validation proves information architecture and routing only; it does not prove live Render/Neon state or deployment.

## First exercise

```bash
node scripts/ai-harness/show-context.mjs orientation
```
