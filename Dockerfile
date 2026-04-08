FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
COPY tools/local/repo-bootstrap.mjs tools/local/repo-bootstrap.mjs
ENV AXTASK_BOOTSTRAP_ALLOW_MISSING_NODEWEAVER=1
# npm ci can fail here when package-lock.json omits optional platform packages (esbuild); npm install still respects the lockfile.
RUN npm install

FROM deps AS build
WORKDIR /app
# Vite inlines VITE_* at bundle time; bump via .env.docker + rebuild after breaking API/schema changes.
ARG VITE_QUERY_PERSIST_BUSTER=v1
ENV VITE_QUERY_PERSIST_BUSTER=$VITE_QUERY_PERSIST_BUSTER
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

RUN groupadd -r axtask && useradd -r -g axtask axtask

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/client ./client
COPY --from=build /app/shared ./shared
COPY --from=build /app/package*.json ./
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
# `npm run start` → db:push → migrate:sql (`run-sql-migrations.mjs` + migrations/*.sql) then drizzle-kit.
# Compose migrate uses `db:push:and-seed-docker` → also needs `docker-seed-demo.mjs`.
COPY --from=build /app/scripts/docker-seed-demo.mjs ./scripts/docker-seed-demo.mjs
COPY --from=build /app/scripts/pre-db-push-kit-workarounds.mjs ./scripts/pre-db-push-kit-workarounds.mjs
COPY --from=build /app/scripts/run-sql-migrations.mjs ./scripts/run-sql-migrations.mjs
COPY --from=build /app/scripts/start-with-db-push.mjs ./scripts/start-with-db-push.mjs
COPY --from=build /app/migrations ./migrations

USER axtask
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:5000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Schema is applied by the compose `migrate` service; use SKIP_DB_PUSH_ON_START when starting app only.
CMD ["node", "scripts/start-with-db-push.mjs"]
