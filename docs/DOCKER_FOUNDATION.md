# AxTask Docker Foundation

## Local stack

```bash
docker compose up --build
```

App: `http://localhost:5000`  
Health: `http://localhost:5000/health`  
Readiness: `http://localhost:5000/ready`

## Environment expectations

- `DATABASE_URL`
- `SESSION_SECRET` (32+ chars)
- `CANONICAL_HOST`
- `FORCE_HTTPS`

## Production notes

- Container runs as non-root user.
- Multi-stage build keeps runtime image smaller.
- Healthcheck uses `/health` for orchestration probes.
- Prefer managed Postgres in production over compose DB.
