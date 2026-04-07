// @vitest-environment node
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");

describe("docker workflow assets", () => {
  it("keeps docker npm scripts wired to .env.docker", () => {
    const packageJsonPath = path.join(projectRoot, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

    expect(packageJson.scripts["docker:env-init"]).toContain(
      "node tools/local/copy-env-docker.mjs",
    );
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
    expect(packageJson.scripts["db:push:and-seed-docker"]).toContain(
      "docker-seed-demo.mjs",
    );
  });

  it("contains compose health gates for database, migration, and app", () => {
    const composePath = path.join(projectRoot, "docker-compose.yml");
    const compose = fs.readFileSync(composePath, "utf8");

    expect(compose).toContain("database:");
    expect(compose).toContain("migrate:");
    expect(compose).toContain("db:push:and-seed-docker");
    expect(compose).toContain("app:");
    expect(compose).toContain("condition: service_healthy");
    expect(compose).toContain("condition: service_completed_successfully");
    expect(compose).toContain('test: ["CMD-SHELL", "pg_isready');
    expect(compose).toContain("/ready");
    expect(compose).toContain('"5000:5000"');
    expect(compose).toContain("VITE_QUERY_PERSIST_BUSTER");
    expect(compose).toContain("axtask-image-build");
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

  it("Dockerfile deps stage runs postinstall with bootstrap script before npm install", () => {
    const dockerfile = fs.readFileSync(path.join(projectRoot, "Dockerfile"), "utf8");
    const bootstrapCopy = dockerfile.indexOf("COPY tools/local/repo-bootstrap.mjs tools/local/repo-bootstrap.mjs");
    const runNpmInstall = dockerfile.indexOf("RUN npm install");
    expect(bootstrapCopy).toBeGreaterThan(-1);
    expect(runNpmInstall).toBeGreaterThan(-1);
    expect(bootstrapCopy).toBeLessThan(runNpmInstall);
    expect(dockerfile).toContain("ENV AXTASK_BOOTSTRAP_ALLOW_MISSING_NODEWEAVER=1");
  });

  it("repo-bootstrap honors AXTASK_BOOTSTRAP_ALLOW_MISSING_NODEWEAVER for slim Docker context", () => {
    const src = fs.readFileSync(path.join(projectRoot, "tools", "local", "repo-bootstrap.mjs"), "utf8");
    expect(src).toContain("AXTASK_BOOTSTRAP_ALLOW_MISSING_NODEWEAVER");
    expect(src).toContain("process.env.AXTASK_BOOTSTRAP_ALLOW_MISSING_NODEWEAVER");
  });
});
