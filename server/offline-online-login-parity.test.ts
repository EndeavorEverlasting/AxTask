// @vitest-environment node
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  AUTH_LOGIN_PATH,
  AUTH_LOGOUT_PATH,
  AUTH_ME_PATH,
  AUTH_REGISTER_PATH,
} from "../shared/http-auth";

const projectRoot = path.resolve(__dirname, "..");

describe("offline ↔ online local login parity (env + contracts)", () => {
  it("shares auth HTTP constants between client and server", () => {
    const indexSrc = fs.readFileSync(path.join(projectRoot, "server", "index.ts"), "utf8");
    expect(indexSrc).toContain("@shared/http-auth");
    expect(indexSrc).toContain("AXTASK_CSRF_COOKIE");
    expect(indexSrc).toContain("AXTASK_CSRF_HEADER");

    const authCtx = fs.readFileSync(
      path.join(projectRoot, "client", "src", "lib", "auth-context.tsx"),
      "utf8",
    );
    expect(authCtx).toContain("AUTH_ME_PATH");
    expect(authCtx).toContain("AUTH_LOGIN_PATH");
    expect(authCtx).toContain(AUTH_ME_PATH);
    expect(authCtx).toContain("credentials: \"include\"");

    const qc = fs.readFileSync(path.join(projectRoot, "client", "src", "lib", "queryClient.ts"), "utf8");
    expect(qc).toContain("@shared/http-auth");
    expect(qc).toContain("AXTASK_CSRF_COOKIE");
    expect(qc).toContain("AXTASK_CSRF_HEADER");
  });

  it("keeps Express routes aligned with shared AUTH_* paths", () => {
    const routes = fs.readFileSync(path.join(projectRoot, "server", "routes.ts"), "utf8");
    expect(routes).toContain(`app.get("${AUTH_ME_PATH}"`);
    expect(routes).toContain(`app.post("${AUTH_LOGIN_PATH}"`);
    expect(routes).toContain(`app.post("${AUTH_REGISTER_PATH}"`);
    expect(routes).toContain(`app.post("${AUTH_LOGOUT_PATH}"`);
  });

  it("documents offline local stack: dev NODE_ENV + local Postgres URL", () => {
    const envExample = fs.readFileSync(path.join(projectRoot, ".env.example"), "utf8");
    expect(envExample).toContain("NODE_ENV=development");
    expect(envExample).toContain("DATABASE_URL=postgresql://");
    expect(envExample).toContain("localhost");
    expect(envExample).toContain("SESSION_SECRET=");
    expect(envExample).toContain("FORCE_HTTPS=false");
    expect(envExample).toContain("CANONICAL_HOST=localhost");
  });

  it("documents Docker local stack: production NODE_ENV + open registration + http-friendly flags", () => {
    const dockerEnv = fs.readFileSync(path.join(projectRoot, ".env.docker.example"), "utf8");
    expect(dockerEnv).toContain("NODE_ENV=production");
    expect(dockerEnv).toContain("REGISTRATION_MODE=open");
    expect(dockerEnv).toContain("FORCE_HTTPS=false");
    expect(dockerEnv).toContain("CANONICAL_HOST=localhost");
    expect(dockerEnv).toMatch(/DATABASE_URL=postgresql:\/\/[^:]+:[^@]+@database:/);
  });

  it("requires DATABASE_URL before offline:start proceeds", () => {
    const script = fs.readFileSync(
      path.join(projectRoot, "tools", "local", "offline-start.mjs"),
      "utf8",
    );
    expect(script).toContain("DATABASE_URL");
    expect(script).toContain("validateLocalEnv");
  });
});
