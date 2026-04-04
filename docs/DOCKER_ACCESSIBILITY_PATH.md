# Docker-First Accessibility Path

This is the execution path to make AxTask easier for non-technical users by moving to a Docker-first workflow.

## Outcome

Users should be able to start AxTask with one action, without manual Node/npm setup, and still have safe defaults for data, updates, and rollback.

## Phase 1: Local Docker UX Baseline (Single Machine)

Goal: One-command start and stop with stable local data.

- Use Docker Compose as the primary local runtime.
- Persist Postgres and app data with named volumes.
- Add health checks for app and DB.
- Provide a one-click launcher script for Windows and macOS/Linux.

Implementation (current):
- `npm run docker:up` (smart start), `docker:start|stop|status|logs`
- Windows one-click scripts: `start-docker.cmd`, `stop-docker.cmd`, `status-docker.cmd`
- macOS/Linux scripts: `start-docker.sh`, `stop-docker.sh`, `status-docker.sh`
- compose sequencing: `database` -> `migrate (db:push)` -> `app`
- persistent volumes: `axtask_postgres_data`, `axtask_storage_data`

Acceptance criteria:
- New user can run one script and open AxTask.
- Restarting containers keeps prior data.
- Health checks report healthy within a defined startup window.

## Phase 2: Guided First-Run Setup

Goal: Remove setup confusion for non-technical users.

- Add startup checks for required env values.
- Auto-generate local `.env` from template when safe.
- Show clear error messages (what failed + how to fix).
- Keep setup scripts idempotent (safe to run repeatedly).

Acceptance criteria:
- First-run setup succeeds on a clean machine with only Docker installed.
- Common failures have plain-language recovery steps.

## Phase 3: Secure Runtime + Update Controls

Goal: Safe, predictable updates across workstations.

- Pin image tags (or digests) per release.
- Add `pull + up` update scripts and rollback scripts.
- Keep runtime guardrails and hook setup documented but optional for Docker users.
- Add a release channel strategy (`stable`, `beta`).

Acceptance criteria:
- Users can update safely with one command.
- Rollback to previous known-good image works.

## Phase 4: Accessibility Packaging

Goal: Make startup and daily use nearly zero-friction.

- Provide desktop shortcuts for start/stop/status.
- Provide optional system-tray style status command.
- Add simple "Is it running?" verification command.
- Keep all commands mirrored in README and quick-start card.

Acceptance criteria:
- Non-technical user can start, stop, and verify status without terminal knowledge.

## Phase 5: Distribution and Shared Environments

Goal: Enable teams and additional workstations.

- Publish signed images to a registry.
- Add workstation onboarding script that pulls images and starts stack.
- Add backup and restore scripts for local volumes.
- Add "migration to another machine" workflow.

Acceptance criteria:
- Another workstation can restore from backup and run with minimal manual steps.

## Non-Goals (for this path)

- Full Kubernetes orchestration.
- Multi-region production deployment.
- Complex service mesh or distributed tracing.

## Risks to Watch

- File permission differences on Windows/macOS/Linux.
- Volume path conflicts across Docker Desktop versions.
- Secret handling drift between `.env` and compose files.
- Upgrade mismatches between AxTask and NodeWeaver image versions.

## Suggested Next Conversation Scope

Use this exact scope in the next chat:

1. Execute Phase 2 only.
2. Add stricter startup validation + first-run helper messaging.
3. Add screenshot placeholders to README Docker section.
4. Validate failure recovery paths with the clean-machine checklist.

## Definition of Done for "Docker Accessible"

- One-click startup works on Windows and macOS/Linux.
- No mandatory local Node/npm installation for end users.
- Data persists across restarts.
- Update and rollback are documented and scriptable.
- Every target workstation/server has Docker runtime prerequisites explicitly documented.
