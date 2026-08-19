authorityRef: axtask.agent-authority.v1

# 30k domain — security-identity

**Load when:** changing authentication, sessions, MFA, admin authorization, browser-visible privacy, pasted/user-composed content, privileged grants, or privacy-sensitive analytics. Do not load unrelated product, database, deployment, or harness detail.

## Responsibility and boundaries

- Auth/session/admin middleware and public serializers are security boundaries; changes require targeted authorization/privacy proof.
- Anything returned to the SPA is client-visible. Public DTO/serializer contracts own what leaves the server.
- Cross-domain handoff: persistence/schema changes → `data-state`; deployment/environment changes → `deployment-runtime`; ordinary UX after security contract is fixed → `application-experience`.

## Demand-loaded owners

The machine-owned trigger → canonical-path table lives in `.ai/disclosure-map.json` and is appended by `show-context.mjs domain security-identity`. Load only the matching security contract.

## Inputs, outputs, proof

Inputs are the exact security contract and touched routes/middleware/serializers. Outputs are bounded code plus security/contract tests. Repository proof never establishes live identity-provider or production-session state. Use `.ai/codebase-map.json` only for deeper path discovery and slice validator records by ID instead of loading the full registry.
