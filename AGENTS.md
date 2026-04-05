# Guidance for automated assistants (Replit Agent, Cursor, Codex, etc.)

These rules are **policy for humans and tools**; they do not replace GitHub branch protection or secret hygiene.

## Version control

- Do **not** commit, push, merge, or open pull requests unless the repository owner **explicitly** asked for that action in this session.
- Do **not** push directly to the protected default branch (`main`) when branch protection expects a PR — use a branch and let the owner merge.
- Do **not** amend or rewrite published history (`rebase --force`, etc.) unless explicitly requested.

## Secrets and environments

- Do **not** print, log, or paste secrets (API keys, `DATABASE_URL`, session secrets, OAuth client secrets).
- Do **not** change production deployment secrets or DNS unless the owner asked for a documented cutover.
- Assume Replit **Secrets** may point at a shared or production database only when the owner confirmed that; default to **least privilege** and **staging-only** for experimental Repls.

## Database and data safety

- Do **not** run destructive commands against a database the owner did not identify as disposable: e.g. `docker:reset`, bulk deletes, dropping schemas, or re-seeding production-like data.
- **`npm run db:push`** (`drizzle-kit push`) changes schema against **`DATABASE_URL`**. Only run it when the owner asked and the target database is correct.
- Post-merge on Replit runs [`scripts/post-merge.sh`](scripts/post-merge.sh); `db:push` runs **only** when `AXTASK_POST_MERGE_DB_PUSH=1` is set. Do not tell users to enable that on a Repl attached to production unless they intend automatic schema sync there.

## Deployments

- Do **not** trigger or assume **Replit Deploy / Autoscale publish** unless the owner asked; publishing applies whatever code is in the Repl to the live URL tied to that deployment.

## Product context

- See [`replit.md`](replit.md) and [`README.md`](README.md) for architecture and **Replit and GitHub safety**.
