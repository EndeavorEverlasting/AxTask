# Promote `experimental/unstable-2026-04-29` to `main`

Date: 2026-04-30

## Purpose

Render is currently deployed from:

```text
experimental/unstable-2026-04-29
```

That branch is confirmed working. The goal is to promote the working deployment line into:

```text
main
```

After promotion, Render should deploy from `main` again. Active production-like deployments should not depend on branches named `experimental` or `unstable`.

## Current known state

- Latest working branch: `experimental/unstable-2026-04-29`
- Target branch: `main`
- Recommended promotion branch: `release/2026-04-30-promote-unstable-29-to-main`
- Older unstable branches should not be deleted until the promotion is verified.

## Promotion plan

### 1. Freeze the working unstable branch

Stop casual commits to `experimental/unstable-2026-04-29` while it is being promoted.

```bash
git fetch --all --prune
git checkout experimental/unstable-2026-04-29
git pull origin experimental/unstable-2026-04-29
git status
```

Expected result:

```text
working tree clean
```

If the tree is dirty, commit or stash first.

### 2. Create a clean release branch

Create the release branch from the known working branch:

```bash
git checkout experimental/unstable-2026-04-29
git checkout -b release/2026-04-30-promote-unstable-29-to-main
git push -u origin release/2026-04-30-promote-unstable-29-to-main
```

This gives the merge a clean name and a clean story.

### 3. Confirm what will enter `main`

```bash
git fetch origin
git log --oneline --decorate --graph origin/main..HEAD
git diff --stat origin/main...HEAD
git diff --name-only origin/main...HEAD
```

Review especially carefully if these paths appear:

```text
render.yaml
package.json
package-lock.json
migrations/
server/routes.ts
shared/schema/
.env.example
.github/workflows/
```

These paths are allowed, but they are higher-risk and deserve deliberate review.

### 4. Run local verification

Minimum gate:

```bash
npm run check
npm run build
npx vitest run
```

Preferred gate:

```bash
npm run check
npm test
npm run build
npm run release:check
npm run test:deploy:contract
```

If a script does not exist, record that explicitly in the PR notes rather than silently skipping it.

### 5. Open a pull request into `main`

Open the PR with:

```text
base: main
compare: release/2026-04-30-promote-unstable-29-to-main
```

Suggested title:

```text
release: promote working 2026-04-29 deploy branch to main
```

Suggested PR summary:

```markdown
## Summary

Promotes the currently deployed and verified Render branch into main.

Current deployed branch:
`experimental/unstable-2026-04-29`

Promotion branch:
`release/2026-04-30-promote-unstable-29-to-main`

## Reason

The 2026-04-29 branch is confirmed working in Render. This PR moves the working deployment line back into `main` so deployment no longer depends on an unstable branch name.

## Verification

- [ ] App currently runs successfully from `experimental/unstable-2026-04-29`
- [ ] `npm run check`
- [ ] `npm test` or `npx vitest run`
- [ ] `npm run build`
- [ ] Render deploy verified after merge

## Post-merge

- Point Render back to `main`
- Verify the live app
- Retain `experimental/unstable-2026-04-29` temporarily as rollback reference
- Delete older unstable branches after `main` is verified
```

### 6. Merge the PR

Recommended merge style: merge commit.

Reason: this branch represents a real deployed line. A merge commit preserves the actual trail better than a squash.

After merge:

```bash
git checkout main
git pull origin main
git log --oneline --decorate --graph -20
```

### 7. Point Render back to `main`

In Render:

```text
Service -> Settings -> Build & Deploy -> Branch
```

Change from:

```text
experimental/unstable-2026-04-29
```

to:

```text
main
```

Trigger a manual deploy from `main`.

Verify:

- Render logs show the deploy is from `main`
- App boots cleanly
- Health route works, if present
- Login works
- Core AxTask screens load
- Task and reminder flows still work

Possible health checks:

```bash
curl https://your-app-url/ready
curl https://your-app-url/api/health
```

Use whichever route exists in the deployed app.

### 8. Keep rollback branch temporarily

Do not delete the working 2026-04-29 branch immediately.

Keep this temporarily:

```text
experimental/unstable-2026-04-29
```

Recommended retention after `main` is verified:

```text
24 to 72 hours
```

Delete older unstable branches first:

```bash
git push origin --delete experimental/unstable-2026-04-27
git push origin --delete experimental/unstable-2026-04-28
```

Delete `experimental/unstable-2026-04-29` only after `main` deploys cleanly and the team agrees rollback is no longer needed.

## Handling stale PRs

Known stale PR candidates:

```text
#34 command parser foundation
#35 command UI dispatcher
#36 release guardrails
#37 durable reminders
#38 combined command/reminder guardrails
```

After the promotion PR is open, compare each stale PR branch against the promotion branch. If the work is contained in the promotion branch, close the stale PR with this comment:

```markdown
Closing as superseded by `release/2026-04-30-promote-unstable-29-to-main`, which promotes the currently deployed 2026-04-29 branch into `main`.
```

Do not leave zombie PRs open after their work is superseded.

## Future branch model

Render should deploy from:

```text
main
```

Feature work should use:

```text
feature/YYYY-MM-DD-short-description
```

Risky integration should use:

```text
integration/YYYY-MM-DD-short-description
```

Release candidates should use:

```text
release/YYYY-MM-DD-short-description
```

Avoid deploying from:

```text
experimental/unstable-*
```

Those are fine for prototypes. They are poor deployment optics.

## Quick command pack

```bash
git fetch --all --prune

git checkout experimental/unstable-2026-04-29
git pull origin experimental/unstable-2026-04-29
git status

git checkout -b release/2026-04-30-promote-unstable-29-to-main
git push -u origin release/2026-04-30-promote-unstable-29-to-main

git diff --stat origin/main...HEAD
git diff --name-only origin/main...HEAD

npm run check
npm test
npm run build
```

Then open:

```text
release/2026-04-30-promote-unstable-29-to-main -> main
```
