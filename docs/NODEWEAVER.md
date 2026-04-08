# NodeWeaver in the AxTask repository

## What NodeWeaver is

NodeWeaver is a **standalone** HTTP classifier service: a universal classification engine that **any** application can call. It is not exclusive to AxTask. AxTask embeds it for first-class task classification, suggestions, and related flows.

## How it lives in this monorepo

NodeWeaver is **vendored** (plain source in git) under:

`services/nodeweaver/upstream`

It is **not** a git submodule. Treat the AxTask repo as a **monorepo**: Node, React client, shared types, and the NodeWeaver Python tree ship together for integration and customization.

## Deployment modes

1. **Vendored / co-located** — Run or containerize from `services/nodeweaver/upstream` (for example Docker Compose profile `nodeweaver`, see [`services/nodeweaver/README.md`](../services/nodeweaver/README.md) and [`tools/local/docker-start.mjs`](../tools/local/docker-start.mjs)).
2. **External service** — Point AxTask at a separately deployed NodeWeaver base URL when your deployment profile requires isolation (scaling, versioning, or multi-app reuse).

AxTask’s server integrates via its classifier/orchestration layer; see [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) for boundaries.

## Upstream repository (optional)

A separate NodeWeaver Git repository may remain the **release source of truth**. Maintainers can sync tagged releases into `services/nodeweaver/upstream` using normal copy/merge workflows—**without** reintroducing submodules.

## Legacy path (do not restore as submodule)

`NodeWeaver._pre_submodule_backup` was an old submodule gitlink. It has been **removed from git tracking**. The name may still appear in `.gitignore` so stray local folders are ignored. Do not add it back as a submodule.
