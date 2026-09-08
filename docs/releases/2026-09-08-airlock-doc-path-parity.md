# Production-startup airlock doc path parity — 2026-09-08

## Diagnosis

PR #150 landed the runtime fuse (`apply-migrations.mjs --production-startup` on Compose migrate and `production-start.mjs`), but canonical Path C/D/E narrative still taught the pre-airlock commands:

- Compose migrate without `--production-startup`
- Dockerfile CMD as an inline `apply-migrations && drizzle-kit push` shell chain
- Render start as unconditional Drizzle push on every boot

That doc drift could send operators back toward the unsafe startup story after the fuse already shipped.

## Change

- Update [`docs/DEV_DATABASE_AND_SCHEMA.md`](../DEV_DATABASE_AND_SCHEMA.md) Path C/D/E to match Compose, Dockerfile `CMD ["node", "scripts/production-start.mjs"]`, and Render’s skip-push-by-default posture.
- Align [`.cursor/rules/schema-migrations.mdc`](../../.cursor/rules/schema-migrations.mdc) and [`docs/DOCKER_ACCESSIBILITY_PATH.md`](../DOCKER_ACCESSIBILITY_PATH.md).
- Contract-test Path C in [`server/deploy-schema-workflow.test.ts`](../../server/deploy-schema-workflow.test.ts) so the unguarded compose migrate command cannot return unnoticed.

## Non-goals

- No runtime behavior change beyond documentation/contracts.
- No Render deploy, no production mutation, no recovery DELETE / reclaim.
- Does not authorize applying recovery migration `9999`.

## Validation

```text
vitest run server/deploy-schema-workflow.test.ts server/docker-stages.test.ts
node tools/ci/check-production-startup-guard.mjs
```
