// @vitest-environment node
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");

describe("docker workflow assets", () => {
  it("keeps docker npm scripts wired to .env.docker", () => {
    const packageJsonPath = path.join(projectRoot, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

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

  it("ships one-click docker helpers with daemon and placeholder guards", () => {
    const windowsStart = fs.readFileSync(
      path.join(projectRoot, "start-docker.cmd"),
      "utf8",
    );
    const unixStart = fs.readFileSync(
      path.join(projectRoot, "start-docker.sh"),
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

    expect(windowsStart).toContain("docker info >nul 2>&1");
    expect(windowsStart).toContain(
      "replace-with-32-plus-char-secret",
    );
    expect(windowsStart).toContain("docker compose --env-file .env.docker up -d --build");
    expect(unixStart).toContain("docker info >/dev/null 2>&1");
    expect(unixStart).toContain("replace-with-32-plus-char-secret|replace-me");
    expect(unixStart).toContain("docker compose --env-file .env.docker up -d --build");
    expect(windowsStatus).toContain("docker compose --env-file .env.docker ps");
    expect(windowsStop).toContain("docker compose --env-file .env.docker down");
  });
});
