// @vitest-environment node
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");

describe("docker workflow assets", () => {
  it("keeps docker npm scripts wired to .env.docker", () => {
    const packageJsonPath = path.join(projectRoot, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

    expect(packageJson.scripts["docker:up"]).toContain(
      "node tools/local/docker-start.mjs",
    );
    expect(
      fs.existsSync(path.join(projectRoot, "tools", "local", "docker-start-lib.mjs")),
    ).toBe(true);
    expect(packageJson.scripts["docker:start"]).toContain(
      "docker compose --env-file .env.docker up -d --build",
    );
    expect(packageJson.scripts["docker:stop"]).toContain(
      "docker compose --env-file .env.docker down",
    );
    expect(packageJson.scripts["docker:status"]).toContain(
      "docker compose --env-file .env.docker ps",
    );
    expect(packageJson.scripts["docker:logs"]).toContain(
      "docker compose --env-file .env.docker logs",
    );
  });

  it("contains compose health gates for database, migration, and app", () => {
    const composePath = path.join(projectRoot, "docker-compose.yml");
    const compose = fs.readFileSync(composePath, "utf8");

    expect(compose).toContain("database:");
    expect(compose).toContain("migrate:");
    expect(compose).toContain("app:");
    expect(compose).toContain("condition: service_healthy");
    expect(compose).toContain("condition: service_completed_successfully");
    expect(compose).toContain('test: ["CMD-SHELL", "pg_isready');
    expect(compose).toContain("/ready");
    expect(compose).toContain('"5000:5000"');
  });

  it("ships one-click docker helpers backed by smart docker-start", () => {
    const windowsStart = fs.readFileSync(
      path.join(projectRoot, "start-docker.cmd"),
      "utf8",
    );
    const unixStart = fs.readFileSync(
      path.join(projectRoot, "start-docker.sh"),
      "utf8",
    );
    const smartStart = fs.readFileSync(
      path.join(projectRoot, "tools", "local", "docker-start.mjs"),
      "utf8",
    );
    const smartLib = fs.readFileSync(
      path.join(projectRoot, "tools", "local", "docker-start-lib.mjs"),
      "utf8",
    );
    const windowsStatus = fs.readFileSync(
      path.join(projectRoot, "status-docker.cmd"),
      "utf8",
    );
    const windowsStop = fs.readFileSync(
      path.join(projectRoot, "stop-docker.cmd"),
      "utf8",
    );

    expect(windowsStart).toContain("npm run docker:up");
    expect(unixStart).toMatch(/npm run docker:up|docker-start\.mjs/);
    expect(smartStart).toContain("docker-start-lib.mjs");
    expect(smartLib).toContain("replace-with-32-plus-char-secret");
    expect(smartLib).toContain("replace-me");
    expect(smartStart).toContain("waitForEngine");
    expect(windowsStatus).toContain("docker compose --env-file .env.docker ps");
    expect(windowsStop).toContain("docker compose --env-file .env.docker down");
  });
});
