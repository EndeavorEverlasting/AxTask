# NodeWeaver (AxTask integration)

NodeWeaver is a **separate Python service**. This folder wires it into the AxTask repo for a **single checkout** and **optional Docker Compose** profile.

## Layout

- **`upstream/`** — git submodule pointing at [NodeWeaver](https://github.com/EndeavorEverlasting/NodeWeaver) (`feature/axtask-contract-hardening`).

## After clone: initialize the submodule

If `services/nodeweaver/upstream` is empty or missing a `Dockerfile`, fetch the submodule:

```bash
git submodule update --init --recursive
```

From the AxTask project root you can run **`npm run submodule:init`** instead (same command).

Or clone AxTask with submodules in one step:

```bash
git clone --recurse-submodules <your-axtask-repo-url>
```

## One-time: add the submodule (only if `.gitmodules` does not exist yet)

Use this when you are **introducing** NodeWeaver into a branch that does not yet have it:

1. Ensure **`services/nodeweaver/upstream` does not exist** (remove any placeholder `.gitkeep` or empty folder).
2. From the **AxTask repo root**:

```bash
git submodule add -b feature/axtask-contract-hardening \
  https://github.com/EndeavorEverlasting/NodeWeaver.git \
  services/nodeweaver/upstream
git submodule update --init --recursive
```

3. Commit **`.gitmodules`** and the **`services/nodeweaver/upstream`** gitlink.

Without a populated `upstream/`, **`docker compose build` for the `nodeweaver` service will fail** (no `Dockerfile`).

## Docker Compose (profile `nodeweaver`)

1. Initialize **`services/nodeweaver/upstream`** as above.
2. In **`.env.docker`**, set:

   ```env
   NODEWEAVER_URL=http://nodeweaver:5000
   ```

   (AxTask’s `app` container uses this hostname on the Compose network. NodeWeaver listens on **5000** inside its image.)

3. Add any keys NodeWeaver expects (for example model/API keys) to `.env.docker`; variable names match the upstream service’s configuration.

4. Start the stack **with the profile**:

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
