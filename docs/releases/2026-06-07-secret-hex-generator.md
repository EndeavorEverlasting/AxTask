# PR: Local hex secret generator

Date: 2026-06-07

## Summary

- Adds `scripts/generate-secret.mjs` — stdout-only lowercase hex secret generator using Node `crypto.randomBytes`.
- Adds `npm run secret:hex` and `npm run secret:token` (alias).
- Default output: 64 hex characters (256 bits). Supports `--chars` and `--bits` modes with validation.
- Wires `scripts/**/*.test.ts` into Vitest (also runs existing VAPID contract tests).

## Operator usage

```powershell
npm run secret:hex
```

Paste stdout into Render/host env (e.g. `OPS_STATUS_TOKEN=<generated-value>`). Do not commit generated output.

## Validation

- `npm run check`
- `npm test`
- `npm run secret:hex` (verify exit 0 locally; do not commit output)
- `npm run build`
- `npm run release:check`

## Rollback

Remove the script and npm aliases; no database or runtime dependency.
