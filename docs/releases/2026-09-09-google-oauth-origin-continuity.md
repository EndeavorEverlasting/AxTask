# 2026-09-09 — Google OAuth origin continuity

## Incident

After the first successful production re-entry, Google login was initiated on `axtask.dev` while Google returned the callback to `axtask.app`. AxTask stores OAuth state in the Express session. The production `axtask.sid` cookie is host-only, so the callback on a different hostname could not recover the session state and returned `/?error=auth_failed` with `Google OAuth state mismatch or missing session` in the service log.

## Live evidence

Render request logs showed the exact split:

- login: `GET /api/auth/google/login` on host `axtask.dev` → 302;
- callback: `GET /api/auth/google/callback?...` on host `axtask.app` → 302;
- application log: `Google OAuth state mismatch or missing session`.

The production database remained intact. The auth failure occurred before account access and was not evidence of task-data loss.

## Repair

The live Render service was repaired first with:

- `CANONICAL_HOST=axtask.app`;
- `GOOGLE_REDIRECT_URI=https://axtask.app/api/auth/google/callback`;
- `ADDITIONAL_ALLOWED_HOSTS=www.axtask.app`.

The tracked Render contract now pins the same values. `axtask.dev` is intentionally not an additional allowed host, so `server/index.ts` redirects it to the canonical host before `/api/auth/google/login` can create OAuth state.

## Regression contract

`tests/deploy/01-env/google-oauth-origin.contract.test.ts` fails if the Render blueprint stops pinning the canonical Google callback or reintroduces `axtask.dev` as an allowed apex host.

## Boundaries

- no user/account/task rows are changed;
- no session secret or OAuth client secret is committed;
- no Google Cloud Console mutation is performed by this repository change;
- WorkOS/Replit/local auth behavior is unchanged;
- PR #139 remains outside this change.

## Validation target

```bash
npx vitest run tests/deploy/01-env/google-oauth-origin.contract.test.ts
npm run check
npm test
npm run release:check
npm run build
git diff --check origin/main...HEAD
```

## Proof ceiling

Repository/CI proof establishes the tracked host/callback contract. Live OAuth acceptance additionally requires observing one same-host login/callback flow and successful authenticated `/api/auth/me`/task access on production.
