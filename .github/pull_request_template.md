## Summary

<!-- What does this PR change? -->

## OPSEC quick scan (check before requesting review)

- [ ] **No secrets in diff** — no production URLs with embedded passwords, API keys, `DATABASE_URL`, `SESSION_SECRET`, OAuth client secrets, or Render env dumps.
- [ ] **Templates only in git** — real values stay in **Render / Neon / `.env.render` (local, gitignored)**.
- [ ] **Deploy files** — if you changed `render.yaml`, Docker, or auth/session code, say so below; expect stricter review.

## Risk / rollout

<!-- Optional: migration, feature flag, rollback -->

## How tested

<!-- e.g. npm test, manual paths -->
