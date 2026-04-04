// @vitest-environment node
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { AUTH_ME_PATH, AUTH_LOGIN_PATH } from "../shared/http-auth";

const projectRoot = path.resolve(__dirname, "..");

describe("local login workflow contracts", () => {
  it("exposes local auth endpoints in API routes", () => {
    const routesPath = path.join(projectRoot, "server", "routes.ts");
    const routes = fs.readFileSync(routesPath, "utf8");

    expect(routes).toContain('app.post("/api/auth/register"');
    expect(routes).toContain(`app.post("${AUTH_LOGIN_PATH}"`);
    expect(routes).toContain('app.post("/api/auth/logout"');
    expect(routes).toContain(`app.get("${AUTH_ME_PATH}"`);
    expect(routes).toContain('passport.authenticate("local"');
    expect(routes).toContain('return res.status(401).json({ message: info?.message || "Invalid credentials" })');
  });

  it("keeps passport local strategy wired to email/password verification", () => {
    const authPath = path.join(projectRoot, "server", "auth.ts");
    const auth = fs.readFileSync(authPath, "utf8");

    expect(auth).toContain("new LocalStrategy");
    expect(auth).toContain('usernameField: "email"');
    expect(auth).toContain("verifyPassword");
    expect(auth).toContain("getUserByEmail");
  });

  it("keeps local-password sign-in entry points in login UI", () => {
    const loginPagePath = path.join(
      projectRoot,
      "client",
      "src",
      "pages",
      "login.tsx",
    );
    const loginPage = fs.readFileSync(loginPagePath, "utf8");

    expect(loginPage).toContain("Sign in with email & password");
    expect(loginPage).toContain("Forgot your password?");
    expect(loginPage).toContain('await login(email, password)');
    expect(loginPage).toContain("/api/auth/forgot-password");
  });
});
