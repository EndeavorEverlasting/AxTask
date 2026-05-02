# NodeWeaver service (vendored)

This directory holds the **vendored** NodeWeaver tree for AxTask.

- **Upstream code** is intended to live in `upstream/` (Python project: `pyproject.toml`, `uv.lock`, Dockerfile, etc.).
- AxTask CI runs pytest here when `services/nodeweaver/upstream/pyproject.toml` is present (see `.github/workflows/test-and-attest.yml`).
- **Current status:** `upstream/` is not yet populated. Sync from the NodeWeaver release source or run as an external service.
- Local bootstrap: [`tools/local/repo-bootstrap.mjs`](../../tools/local/repo-bootstrap.mjs). Docker: enable the `nodeweaver` Compose profile via [`tools/local/docker-start.mjs`](../../tools/local/docker-start.mjs).

**Canonical policy and architecture:** [`docs/NODEWEAVER.md`](../../docs/NODEWEAVER.md).
