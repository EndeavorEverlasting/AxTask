FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
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
COPY --from=build /app/scripts ./scripts

USER axtask
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:5000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
