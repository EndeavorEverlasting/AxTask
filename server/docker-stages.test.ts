// @vitest-environment node
/**
 * Deployment-stage checklist tests for the production Docker image and Render
 * pipeline. Each test maps to a concrete step in the deployment sequence so a
 * regression in any stage fails a unit test before it reaches Render.
 *
 * Deployment stages we cover (mirror of what Render shows in its build log):
 *   1. deps:        npm install in the build image
 *   2. build:       npm run build (vite + esbuild)
 *   3. runtime:     node_modules + dist + client + shared + package*.json
 *                   + drizzle.config.ts + migrations + scripts directory
 *   4. healthcheck: container probes /health
 *   5. CMD:         delegates ordered startup to scripts/production-start.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const dockerfile = fs.readFileSync(path.join(projectRoot, "Dockerfile"), "utf8");

describe("Dockerfile build and runtime stages", () => {
  it("Stage 1 (deps) installs dependencies before build", () => {
    expect(dockerfile).toContain("FROM node:20-bookworm-slim AS deps");
    expect(dockerfile).toMatch(/COPY\s+package\*\.json/);
    expect(dockerfile).toMatch(/RUN\s+npm\s+install/);
  });

  it("Stage 2 (build) runs npm run build on the full source", () => {
    expect(dockerfile).toContain("FROM deps AS build");
    expect(dockerfile).toMatch(/COPY\s+\.\s+\./);
    expect(dockerfile).toContain("RUN npm run build");
  });

  it("Stage 3 (runtime) copies every artifact required at boot", () => {
    expect(dockerfile).toContain("FROM node:20-bookworm-slim AS runtime");
    const required = [
      "COPY --from=deps /app/node_modules ./node_modules",
      "COPY --from=build /app/dist ./dist",
      "COPY --from=build /app/client ./client",
      "COPY --from=build /app/shared ./shared",
      "COPY --from=build /app/package*.json ./",
      "COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts",
      "COPY --from=build /app/migrations ./migrations",
      "COPY --from=build /app/scripts ./scripts",
      "test -f /app/scripts/production-start.mjs",
      "test -f /app/scripts/apply-migrations.mjs",
      "test -f /app/scripts/migration-airlock.mjs",
    ];
    for (const line of required) {
      expect(dockerfile, `Missing Dockerfile line: ${line}`).toContain(line);
    }
  });

  it("Stage 3 (runtime) creates the attachment storage directory with correct owner", () => {
    expect(dockerfile).toContain(
      "RUN mkdir -p /app/storage/attachments && chown -R axtask:axtask /app/storage",
    );
    expect(dockerfile).toContain("USER axtask");
    expect(dockerfile).toContain("EXPOSE 5000");
  });

  it("Stage 4 (healthcheck) probes /health", () => {
    expect(dockerfile).toMatch(/HEALTHCHECK[\s\S]*fetch\(['"]http:\/\/localhost:5000\/health['"]/);
  });

  it("Stage 5 (CMD) delegates startup order to production-start", () => {
    expect(dockerfile).toContain('CMD ["node", "scripts/production-start.mjs"]');

    const src = fs.readFileSync(path.join(projectRoot, "scripts", "production-start.mjs"), "utf8");
    const envIdx = src.indexOf("check-env.mjs");
    const capacityIdx = src.indexOf("check-db-capacity.mjs");
    const applyIdx = src.indexOf("apply-migrations.mjs");
    const pushIdx = src.indexOf('[drizzleBin, "push", "--force"]');
    const nodeIdx = src.indexOf("spawn(process.execPath, [distIndex]");

    expect(envIdx).toBeGreaterThan(-1);
    expect(capacityIdx).toBeGreaterThan(envIdx);
    expect(applyIdx).toBeGreaterThan(capacityIdx);
    expect(pushIdx).toBeGreaterThan(applyIdx);
    expect(nodeIdx).toBeGreaterThan(pushIdx);

    // Must close stdin on drizzle-kit push to prevent interactive prompts on Render.
    expect(src).toContain('stdio: ["ignore", "inherit", "pipe"]');
  });
});

describe("docker-compose deployment chain", () => {
  const compose = fs.readFileSync(path.join(projectRoot, "docker-compose.yml"), "utf8");

  it("database service exposes pg_isready healthcheck", () => {
    expect(compose).toMatch(/database:/);
    expect(compose).toMatch(/pg_isready/);
  });

  it("migrate service depends on database health and runs apply-migrations then db:push with stdin closed", () => {
    expect(compose).toMatch(/migrate:\s*\n[\s\S]*?condition:\s*service_healthy/);
    expect(compose).toMatch(/node scripts\/apply-migrations\.mjs\s*&&\s*npm run db:push\s*<\s*\/dev\/null/);
  });

  it("app service waits for migrate to complete successfully and exposes port 5000", () => {
    expect(compose).toMatch(/condition:\s*service_completed_successfully/);
    expect(compose).toContain('"5000:5000"');
    expect(compose).toContain("/ready");
  });
});
