# AxTask Docker Foundation

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
6. From the `AxTask` folder:

```bash
cp .env.docker.example .env.docker
```

7. Edit `.env.docker` and set:
   - `POSTGRES_PASSWORD` (non-placeholder)
   - `SESSION_SECRET` (strong 32+ character value)
   - `DATABASE_URL` password segment to match `POSTGRES_PASSWORD`
   - Optional: `AXTASK_ALARM_COMPANION_URL` (for host native alarm bridge; e.g. `http://host.docker.internal:8787/apply-alarm`)
8. Start with one command:

```bash
npm run docker:start
```

9. Verify:

```bash
npm run docker:status
```

10. Open `http://localhost:5000`.

## Local stack (one command)

First run:

```bash
cp .env.docker.example .env.docker
```

Set strong values in `.env.docker`:
- `POSTGRES_PASSWORD`
- `SESSION_SECRET` (32+ chars)
- Keep `DATABASE_URL` password segment aligned with `POSTGRES_PASSWORD`
- Optional: `AXTASK_ALARM_COMPANION_URL` for hybrid native alarm apply

Start:

```bash
npm run docker:start
```

Optional hybrid native alarm bridge (run on host OS, outside container):

```bash
npm run alarm:companion:start
```

This companion exposes `POST /apply-alarm` on `127.0.0.1:8787` and is reached from Docker using `AXTASK_ALARM_COMPANION_URL`.

Stop/status:

```bash
npm run docker:stop
npm run docker:status
```

## What compose now does

- Starts PostgreSQL with persistent volume (`axtask_postgres_data`)
- Runs the **`migrate`** service once per `up`: **`node scripts/apply-migrations.mjs`** then **`npm run db:push`** (SQL migrations before Drizzle push)
- Starts **app** only after the database is healthy and **`migrate`** has **completed successfully**
- Persists attachment/object storage in `axtask_storage_data`
- Exposes app on `http://localhost:5000`

Full command order for local vs Docker vs production: [DEV_DATABASE_AND_SCHEMA.md](./DEV_DATABASE_AND_SCHEMA.md).

Health endpoints:
- `GET /health`
- `GET /ready`

## Clean-machine checklist

1. Install Docker (Desktop or Engine + Compose plugin).
2. Clone/copy AxTask project.
3. Create `.env.docker` from `.env.docker.example`.
4. Set `POSTGRES_PASSWORD` and `SESSION_SECRET` in `.env.docker`.
5. Run `npm run docker:start`.
6. Verify `npm run docker:status` shows healthy services.
7. Open `http://localhost:5000`.

## Server note

If you deploy on a server, the server must also have Docker installed/configured.

Minimum server flow:
1. Install Docker Engine + Compose plugin.
2. Copy project and `.env.docker` to server.
3. Run `npm run docker:start` (or `docker compose up -d --build`).
4. Configure firewall/reverse proxy/TLS as appropriate.
