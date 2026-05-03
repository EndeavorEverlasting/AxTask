# 2026-05-03 — Environment secret generator

## Summary

Added an operator-facing secret generator and checklist so production secrets can be generated safely without manually creating dozens of password-manager entries.

## Operator notes

- Run `npm run env:secrets:generate` locally to print copy/paste-ready secret values.
- Store generated values in the password manager and deployment host environment.
- Do not commit generated output.
- Do not generate new production values on every boot; production secrets must stay stable until intentionally rotated.
- Generate VAPID separately with `npm run vapid:generate` because it is a key pair and includes a client-visible public key.
