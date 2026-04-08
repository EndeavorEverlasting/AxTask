# Guidance for automated assistants (Replit Agent, Cursor, Codex, etc.)

These rules are **policy for humans and tools**; they do not replace GitHub branch protection or secret hygiene.

## Version control

- Do **not** commit, push, merge, or open pull requests unless the repository owner **explicitly** asked for that action in this session.
- Do **not** push directly to the protected default branch (`main`) when branch protection expects a PR — use a branch and let the owner merge.
- Do **not** amend or rewrite published history (`rebase --force`, etc.) unless explicitly requested.

## Ship for publish / review

When the owner **explicitly** asks to **commit**, **push**, or get the repo **ready to publish** / review in the same message:

1. Run **`git status`** (including untracked) **before** staging. The working tree may include changes from **other chats, local edits, or merges** outside this session’s context window—do **not** assume you have seen every modified file. Review the full list and stage **all** intentional project changes, not only paths touched in the current conversation.
2. Run **`npm run check`** and **`npm test`** after substantive edits if they have not already been run successfully in that session.
3. Stage all intentional changes (`git add` the relevant paths, or `git add -u` when everything modified should ship). Add **new** files explicitly when they should be tracked. **Do not** leave modified tracked files uncommitted when the goal is a clean tree for publish. **Do not** commit gitignored secrets (e.g. `*EnvFromRender.env`, `.env.render` with real values); follow existing ignore rules.
4. Commit with a concise message describing what changed and why (mention cross-session work if the diff includes it).
5. **`git push`** the current branch the owner is using (typically a feature branch), not `main`, when branch protection expects a PR—unless they specified otherwise.
6. **`.gitignore`:** keep ignoring only local secrets, build artifacts, caches, and IDE noise per existing patterns. Do **not** add rules that ignore application source (`client/`, `server/`, `shared/`, `migrations/`, etc.), tests, or shared tooling config unless the owner explicitly wants those paths excluded.

## Secrets and environments

- Do **not** print, log, or paste secrets (API keys, `DATABASE_URL`, session secrets, OAuth client secrets).
- Do **not** change production deployment secrets or DNS unless the owner asked for a documented cutover.
- Assume Replit **Secrets** may point at a shared or production database only when the owner confirmed that; default to **least privilege** and **staging-only** for experimental Repls.

### Render env automation (AxTask)

- Real deploy scaffold (random `SESSION_SECRET` / `AUTH_AUDIT_PEPPER`): **`npm run render:env-bootstrap -- --domain=HOST [--invite] [--force]`** → gitignored `.env.render`.
- **Agents / CI** when secrets are unavailable: **`npm run render:env-placeholder -- --domain=HOST`** (or `render:env-bootstrap -- --placeholders-only --force`) — same keys as [`.env.render.example`](.env.render.example), **no** cryptographically generated secrets.
- **Never commit** Render dashboard env exports (e.g. `*EnvFromRender.env`); root [`.gitignore`](.gitignore) ignores those patterns alongside `.env.render`.

## Database and data safety

- Do **not** run destructive commands against a database the owner did not identify as disposable: e.g. `docker:reset`, bulk deletes, dropping schemas, or re-seeding production-like data.
- **`npm run db:push`** (`drizzle-kit push`) changes schema against **`DATABASE_URL`**. Only run it when the owner asked and the target database is correct.
- Post-merge on Replit runs [`scripts/post-merge.sh`](scripts/post-merge.sh); `db:push` runs **only** when `AXTASK_POST_MERGE_DB_PUSH=1` is set. Do not tell users to enable that on a Repl attached to production unless they intend automatic schema sync there.

## Deployments

- Do **not** trigger or assume **Replit Deploy / Autoscale publish** unless the owner asked; publishing applies whatever code is in the Repl to the live URL tied to that deployment.

## Product context

- See [`replit.md`](replit.md) and [`README.md`](README.md) for architecture and **Replit and GitHub safety**.
