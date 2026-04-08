# NodeWeaver (AxTask integration)

NodeWeaver is the **Python classification service** for AxTask. Sources are **vendored in this monorepo** at [`upstream/`](./upstream/) (not a git submodule). Upstream development continues at [github.com/EndeavorEverlasting/NodeWeaver](https://github.com/EndeavorEverlasting/NodeWeaver); refresh this tree when you intentionally integrate a new drop.

## Layout

- **`upstream/`** — full NodeWeaver app (`Dockerfile`, `main.py`, `pyproject.toml`, `uv.lock`, tests, etc.). This is what **Docker Compose** and **CI** use.
- **This README** — how AxTask wires NodeWeaver in.

## After clone

**`npm install`** runs **`postinstall`**, which verifies **`services/nodeweaver/upstream/Dockerfile`** and (outside CI, if **`uv`** is on your PATH) runs **`uv sync`** in that directory when `uv.lock` / `pyproject.toml` change. **`npm run dev`** runs the same check via **`predev`** first.

Optional: **`npm run submodule:init`** is a legacy name for the same bootstrap script.

Set **`AXTASK_SKIP_NODEWEAVER_PY=1`** to skip the optional `uv sync` (AxTask does not require local Python).

## Refreshing from the NodeWeaver GitHub repo

When you need a newer upstream snapshot:

1. Pull or checkout the desired commit in a separate clone of [NodeWeaver](https://github.com/EndeavorEverlasting/NodeWeaver).
2. Copy or merge files into **`services/nodeweaver/upstream/`** (exclude `.git`, local venvs, `__pycache__`, `.env`).
3. Run **`uv sync`** there if you use local Python; commit the AxTask repo.

Do not maintain a second full copy under **`NodeWeaver/`** — that path was removed in favor of this vendor tree.

## Docker Compose (profile `nodeweaver`)

1. In **`.env.docker`**, set:

   ```env
   NODEWEAVER_URL=http://nodeweaver:5000
   ```

   (AxTask’s `app` container uses this hostname on the Compose network. NodeWeaver listens on **5000** inside its image.)

2. Add any keys NodeWeaver expects (for example model/API keys) to `.env.docker`; variable names match the upstream service’s configuration.

3. Start the stack **with the profile**:

   ```bash
   npm run docker:up:nodeweaver
   ```

   Or: `node tools/local/docker-start.mjs --with-nodeweaver`

   Or: `docker compose --env-file .env.docker --profile nodeweaver up -d --build`

The default **`npm run docker:up`** does **not** start NodeWeaver (no profile).

## Host access to NodeWeaver (optional)

With the profile enabled, port **`5001`** on the host is mapped to NodeWeaver’s port 5000 (`127.0.0.1:5001`). Override with **`NODEWEAVER_HOST_PORT`** in the shell or `.env.docker` if needed.

## Contract

AxTask calls **`POST /api/v1/classify/batch`** on `NODEWEAVER_URL`. See [`server/services/classification/nodeweaver-client.ts`](../../server/services/classification/nodeweaver-client.ts).

## One bill, one product experience

Run NodeWeaver **only** as the Compose service next to AxTask (same host / same `docker compose` project), or point `NODEWEAVER_URL` at a single shared classifier URL. Avoid paying for **two** separate production apps (duplicate AxTask + NodeWeaver SaaS stacks) for the same user-facing product; this layout keeps the classifier **optional** and **co-located** by default.
