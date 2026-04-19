# Git branching and deployment hygiene

This project is safe to **run and test live on your machine** (local dev server, Docker, or any non-production URL you control). Iteration there does not, by itself, change what end users see.

Risk appears when you **push commits to the remote branch that your hosting or CI/CD treats as production** (or as the automatic deploy target). A push there can trigger builds, releases, or simply merge unfinished work into the line everyone else assumes is stable.

> **AxTask / Render specifics.** `render.yaml` is configured with
> `autoDeploy: true`, meaning every push (or merge) that lands on the
> production-deploy branch triggers a build and deploy immediately. Safety
> is delegated to the deploy-start chain in
> [`scripts/production-start.mjs`](../scripts/production-start.mjs):
> capacity gate → SQL migrations → drizzle-kit push → server. If the
> capacity gate fails, the deploy aborts before migrations run and Render
> rolls back to the previous image via `healthCheckPath: /ready`.
> Because there is no human in the loop, the branching rules below are
> the *only* protection against shipping unfinished work — take them
> literally.

## Principles

1. **Experiment freely locally** — use `npm run start:local`, Docker, or your preferred flow; break things in your workspace without guilt.
2. **Isolate remote experiments** — create a **feature branch** (for example `feat/short-description` or `fix/issue-123`) for work that is not ready to ship.
3. **Integrate through a PR** — open a pull request into your team’s **integration branch** (whatever GitHub/GitLab shows as the default merge target, or the branch your pipeline deploys from—confirm with your team if unsure). Review and CI run there; only then should changes land on the deploy-tracking branch.

Naming of the default or production branch can differ per fork (`main`, `master`, `release`, etc.). The rule is: **know which remote branch is wired to production deploy**, and do not use it as a scratchpad.

## Before every `git push`

- Run `git branch --show-current` (or your UI equivalent) and confirm you are on the branch you intend.
- Prefer pushing a **feature branch** first; merge to the deploy-connected branch only via PR after checks pass.
- Avoid **force-push** to shared branches others build from, especially any branch connected to production.

## Related checks

- Large infrastructure moves: see [MORNING_NEW_BOX_MIGRATION_CHECKLIST.md](./MORNING_NEW_BOX_MIGRATION_CHECKLIST.md) (includes confirming the active branch before risky steps).
- If you add or rename Express routes, update the route inventory snapshot as described in [server/routes-inventory.contract.test.ts](../server/routes-inventory.contract.test.ts) (`vitest run` with `-u` on that file when the change is intentional).
