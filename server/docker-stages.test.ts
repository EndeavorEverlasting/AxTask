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
 *                   + drizzle.config.ts + migrations + scripts/apply-migrations.mjs
 *   4. healthcheck: container probes /health
 *   5. CMD:         node apply-migrations.mjs -> drizzle-kit push --force -> node dist/index.js
 *                   with stdin closed on drizzle-kit push (no interactive prompts)
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
      "COPY --from=build /app/scripts/apply-migrations.mjs ./scripts/apply-migrations.mjs",
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

  it("Stage 5 (CMD) runs migrations then drizzle push with stdin closed then server", () => {
    const cmdMatch = dockerfile.match(/CMD\s*\[\s*"sh",\s*"-c",\s*"([^"]+)"\s*\]/);
    expect(cmdMatch, "Dockerfile CMD").toBeTruthy();
    const body = cmdMatch![1];

    const applyIdx = body.indexOf("node scripts/apply-migrations.mjs");
    const pushIdx = body.indexOf("drizzle-kit push --force");
    const nodeIdx = body.indexOf("node dist/index.js");

    expect(applyIdx).toBeGreaterThan(-1);
    expect(pushIdx).toBeGreaterThan(applyIdx);
    expect(nodeIdx).toBeGreaterThan(pushIdx);

    // Must close stdin on drizzle-kit push to prevent interactive prompts on Render.
    expect(body).toMatch(/drizzle-kit push --force[^&|;]*<\s*\/dev\/null/);
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
