# Progressive disclosure harness factoring — 2026-08-19

## Scope

Repository harness/spec information architecture only. Product behavior, production provider state, runtime configuration, database contents, and unrelated documentation are unchanged.

## Three-layer contract

- **50k orientation:** `.ai/README.md` only; app purpose, major domains, canonical entrypoints, first commands, proof boundary, and drill-down routes.
- **30k domain:** one file under `.ai/domains/`; responsibilities, boundaries, owning contracts, workflows, and conditional drill-down links only.
- **15k workflow:** `show-context.mjs workflow <id>` renders one workflow spec, required skill/contract/schema files, shared failure/handoff contracts, and projected validator/artifact records by ID. Whole registries, unrelated domains, history, and large implementation files remain on demand.

## Before measurements

No tokenizer was available, so estimates use UTF-8 bytes / 4.

| Retrieval simulation | Default files before | Bytes | Estimated tokens |
|---|---:|---:|---:|
| What is this app and how is it organized? | AGENTS + guardrails + `.ai/README` + queue + authority + harness + codebase map | 71,972 | 17,993 |
| How does the repository harness domain work? | `.ai/README` + authority + harness + codebase/artifact/capability maps | 57,362 | 14,341 |
| How do I run local deployment certification? | workflow + skills + runtime schema + whole workflow/validator/artifact/trigger registries | 42,121 | 10,531 |

These simulations reflect the documented pre-factor loading pattern, not repository total size. The path-level baseline inventory (purpose, owner, load trigger, size, overlap, and consumer) is preserved at `.ai/reports/progressive-disclosure-baseline-20260819.json` and is demand-loaded evidence, not an entry-path dependency.

## After measurement and enforcement

`node scripts/ai-harness/validate-progressive-disclosure.mjs` renders the actual 50k/30k/15k bundles and fails when any route is broken, any registered workflow is unrouted, any validator/artifact ID is unresolved, or a bundle exceeds 1,000 / 2,000 / 4,000 estimated tokens without a recorded exception. The contract test and dedicated CI workflow prevent silent re-bloat.

## Authority and proof ceiling

`AGENTS.md` retains universal governance and machine-authority anchors; unique domain rules remain owned by their existing canonical documents and are routed from the relevant 30k map. Repository/CI validation proves information architecture and routing only; it does not prove live Render/Neon state or deployment.
