# NodeWeaver (AxTask integration)

NodeWeaver is the **Python classification service** for AxTask. It is included as a **git submodule** at **`NodeWeaver/`**, tracking [github.com/EndeavorEverlasting/NodeWeaver](https://github.com/EndeavorEverlasting/NodeWeaver). You get **one AxTask clone** plus an explicit upstream pointer, and **one Docker Compose stack** when you enable the profile.

## Clone and submodule

- **Recommended:** `git clone --recurse-submodules <AxTask-url>` then `cd AxTask`.
- **Existing clone without submodules:** `git submodule update --init --recursive`.
- **Update NodeWeaver to the commit recorded by AxTask:** `git submodule update --init NodeWeaver` (or `git pull` in `NodeWeaver/` after AxTask bumps the submodule).

## Layout

- **`NodeWeaver/`** — submodule checkout (`Dockerfile`, `main.py`, etc.). Contribute changes via the **NodeWeaver** repository (or a fork), then bump the submodule commit in AxTask when integrating.

This **`services/nodeweaver/`** folder holds integration docs only (no Python app).

## After clone

**`npm install`** runs **`postinstall`**, which verifies **`NodeWeaver/Dockerfile`** and (outside CI, if **`uv`** is on your PATH) syncs the Python env when `uv.lock` / `pyproject.toml` change. **`npm run dev`** runs the same check via **`predev`** first.

Optional: **`npm run submodule:init`** runs the same bootstrap script (legacy script name).

Set **`AXTASK_SKIP_NODEWEAVER_PY=1`** to skip the optional `uv sync` (AxTask does not require local Python).

## Working without the submodule (advanced)

If you intentionally omit the submodule (e.g. minimal checkout), Docker profile **`nodeweaver`** and local **`uv sync`** will not find sources until you run **`git submodule update --init --recursive`**. Do not copy a standalone NodeWeaver tree **on top of** the submodule path without git knowing—use submodule commands instead.

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
