# AxTask Docker Foundation

**Clone → configure → run:** After cloning the repo, create `.env.docker` from `.env.docker.example` (**`npm run docker:env-init`** works on every OS; on Windows **cmd** use `copy`, not Unix `cp`), set `POSTGRES_PASSWORD` and `SESSION_SECRET` (and align `DATABASE_URL`), then from the project root run **`npm run docker:up`** or double-click **`start-docker.cmd`** on Windows. Full narrative: [README.md](../README.md#run-locally-after-cloning-with-docker).

Safe-by-default cleanup commands:
- **`npm run docker:cleanup`** — non-destructive cleanup (containers/networks/orphans + dangling images; keeps volumes/data)
- **`npm run docker:reset`** — destructive reset (includes volume wipe)

## Prerequisites (all target machines)

You must install Docker on every machine where AxTask will run.

- Workstations (Windows/macOS): Docker Desktop
- Linux/server: Docker Engine + Docker Compose plugin (v2)

Dockerizing AxTask on one machine does **not** automatically make another machine runnable without Docker.

## Docker Desktop setup (Windows/macOS)

Use this when onboarding a fresh workstation ("next box").

1. Install Docker Desktop from [docker.com](https://www.docker.com/products/docker-desktop/).
2. Start Docker Desktop and wait until it reports that Docker is running.
3. In Docker Desktop Settings:
   - Enable Docker Compose V2 (usually enabled by default).
   - Allocate enough resources (recommended minimum: 4 GB RAM).
   - Keep WSL2 backend enabled on Windows (default recommended).
4. Open a terminal and verify:

```bash
docker --version
docker compose version
docker info
```

5. Clone/copy `AxTask` to the workstation.
6. From the `AxTask` folder, create `.env.docker`:

```bash
npm run docker:env-init
```

(Alternatives: macOS/Linux/Git Bash/WSL: `cp .env.docker.example .env.docker` · Windows **cmd**: `copy .env.docker.example .env.docker` · PowerShell: `Copy-Item .env.docker.example .env.docker`)

7. Edit `.env.docker` and set:
   - `POSTGRES_PASSWORD` (non-placeholder)
   - `SESSION_SECRET` (strong 32+ character value)
   - `DATABASE_URL` password segment to match `POSTGRES_PASSWORD`
8. Start with one command:

```bash
npm run docker:up
```

(`docker:up` waits for the engine and, on Windows/macOS, can start Docker Desktop if it is installed but not running. Use `npm run docker:start` for a direct compose up when the daemon is already up.)

9. Verify:

```bash
npm run docker:status
```

10. Open `http://localhost:5000`.

## Local stack (one command)

First run — create `.env.docker` (see README for Windows **cmd** vs `cp`):

```bash
npm run docker:env-init
```

Set strong values in `.env.docker`:
- `POSTGRES_PASSWORD`
- `SESSION_SECRET` (32+ chars)
- Keep `DATABASE_URL` password segment aligned with `POSTGRES_PASSWORD`

Start:

```bash
npm run docker:up
```

Stop/status/cleanup:

```bash
npm run docker:stop
npm run docker:status
npm run docker:cleanup
```

Only when you explicitly want to delete local Docker DB/storage volumes:

```bash
npm run docker:reset
```

## What compose now does

- Starts PostgreSQL with persistent volume (`axtask_postgres_data`)
- Runs one-time schema sync (`npm run db:push`) in `migrate` service
- Starts app only after DB is healthy and migration completes
- Persists attachment/object storage in `axtask_storage_data`
- Exposes app on `http://localhost:5000`

Health endpoints:
- `GET /health`
- `GET /ready`

## Offline Phase A: read cache and rebuilds

The browser SPA **persists successful read-query data** in `localStorage` (except `/api/auth`, `/api/admin`, and `/api/billing`) so the UI can still show the last good data when the network drops. That behavior is documented for the app as a whole in **[OFFLINE_PHASE_A.md](./OFFLINE_PHASE_A.md)**.

**Docker-specific notes:**

- The static client is produced during **`docker compose build`** (`vite build` in the image). Runtime variables in `.env.docker` do **not** change an already-built bundle.
- **`VITE_QUERY_PERSIST_BUSTER`** in `.env.docker` is passed as a **build argument** (default `v1`). When you ship a change that invalidates cached JSON shapes, **bump this value** in `.env.docker` and **rebuild** (`npm run docker:up` or `npm run docker:start`, which use `--build`). Clients with an older buster key will drop the persisted query blob on next load.
- Logout in the app still clears the persisted cache for that browser profile; use a strong buster when you need **all** Docker users to reset without relying on logout.

## Offline Phase B: device refresh (database)

Phase B lets the SPA **re-establish a Passport session** when the short-lived session cookie (`axtask.sid`) is missing or expired but a valid **httpOnly** device cookie (`axtask.drefresh`) is still present. Full behavior, limits, and security notes: **[OFFLINE_PHASE_B.md](./OFFLINE_PHASE_B.md)**.

**Docker-specific notes:**

- The **`migrate`** service runs **`npm run db:push`**, which creates the **`device_refresh_tokens`** table (and the rest of the schema). No extra env vars are required for Phase B.
- If you deploy from an **older** image or database snapshot that predates Phase B, ensure **one successful migrate** has run before expecting silent refresh to work; otherwise `POST /api/auth/refresh` cannot persist rotated tokens.
- **`POST /api/auth/refresh`** is subject to the same **CSRF** rules as other state-changing `/api/*` POSTs (double-submit cookie + header). The SPA already sends the header on refresh.
- **Log out** revokes the current device token and clears both cookies — important on **shared machines**.

## Clean-machine checklist

1. Install Docker (Desktop or Engine + Compose plugin).
2. Clone/copy AxTask project.
3. Create `.env.docker` from `.env.docker.example`.
4. Set `POSTGRES_PASSWORD` and `SESSION_SECRET` in `.env.docker`.
5. Run `npm run docker:up` (or `npm run docker:start` if Docker is already running).
6. Verify `npm run docker:status` shows healthy services.
7. Open `http://localhost:5000`.

## Optional: NodeWeaver (classifier) in Compose

The stack can run **NodeWeaver** alongside AxTask using the Compose profile **`nodeweaver`**. NodeWeaver sources ship under `services/nodeweaver/upstream`. Set **`NODEWEAVER_URL=http://nodeweaver:5000`** in `.env.docker`, then run **`npm run docker:up:nodeweaver`**. Default **`npm run docker:up`** does not start NodeWeaver. Details: [`services/nodeweaver/README.md`](../services/nodeweaver/README.md).

## Docker demo login (local stacks)

When **`AXTASK_DOCKER_SEED_DEMO=1`** in `.env.docker`, the **migrate** service runs **`db:push`** then seeds **`DOCKER_DEMO_USER_EMAIL`** / **`DOCKER_DEMO_PASSWORD`**. **`npm run docker:up`** prints the same pair when it finishes. Disable (**`AXTASK_DOCKER_SEED_DEMO=0`**) before exposing Compose to the internet.

User-facing steps (including non-Docker local dev): **[SIGN_IN.md](./SIGN_IN.md)**.

## Server note

If you deploy on a server, the server must also have Docker installed/configured.

Minimum server flow:
1. Install Docker Engine + Compose plugin.
2. Copy project and `.env.docker` to server.
3. Run `npm run docker:up` or `npm run docker:start` (or `docker compose up -d --build`).
4. Configure firewall/reverse proxy/TLS as appropriate.
