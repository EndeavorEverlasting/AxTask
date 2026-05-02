# AxTask Destructive Command Guards

This directory will contain scripts that block unsafe commands in production-like environments.

## Planned Scripts

| Script | Purpose |
|---|---|
| `block-prod-destructive.mjs` | Refuse dangerous commands against production-like DBs |
| `detect-db-environment.mjs` | Classify DATABASE_URL as local/staging/production-like |
| `require-human-override.mjs` | Require explicit override token for rare operations |

## Default Rule

Fail closed.
