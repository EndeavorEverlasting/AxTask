// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import os from "os";

const projectRoot = path.resolve(__dirname, "..");
const bootstrapScript = path.join(projectRoot, "tools", "local", "bootstrap-local-secrets.mjs");

describe("offline one-click workflow assets", () => {
  it("has required local defaults in .env.example", () => {
    const envExamplePath = path.join(projectRoot, ".env.example");
    const content = fs.readFileSync(envExamplePath, "utf8");

    expect(content).toContain("DATABASE_URL=");
    expect(content).toContain("SESSION_SECRET=");
    expect(content).toContain("NODE_ENV=development");
  });

  it("exposes local:env-init for cross-platform .env bootstrap", () => {
    const packageJsonPath = path.join(projectRoot, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    expect(packageJson.scripts["local:env-init"]).toBe(
      "node tools/local/copy-env-local.mjs",
    );
    expect(packageJson.scripts["local:secrets-bootstrap"]).toBe(
      "node tools/local/bootstrap-local-secrets.mjs",
    );
    expect(
      fs.existsSync(path.join(projectRoot, "tools", "local", "copy-env-local.mjs")),
    ).toBe(true);
    expect(fs.existsSync(bootstrapScript)).toBe(true);
  });

  it("copy-env-local runs bootstrap-local-secrets after copy path", () => {
    const copyScript = fs.readFileSync(
      path.join(projectRoot, "tools", "local", "copy-env-local.mjs"),
      "utf8",
    );
    expect(copyScript).toContain("bootstrap-local-secrets.mjs");
  });

  it("offline-start invokes bootstrap before validateLocalEnv", () => {
    const offline = fs.readFileSync(
      path.join(projectRoot, "tools", "local", "offline-start.mjs"),
      "utf8",
    );
    expect(offline).toContain("ensureLocalSessionSecret");
    expect(offline).toContain("bootstrap-local-secrets.mjs");
  });

  it("bootstrap replaces SESSION_SECRET placeholder via AXTASK_LOCAL_ENV_FILE", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "axtask-lsb-"));
    const envFile = path.join(dir, ".env");
    fs.writeFileSync(
      envFile,
      "SESSION_SECRET=replace-with-a-32-plus-char-random-secret\nFOO=bar\n",
      "utf8",
    );
    const r = spawnSync(process.execPath, [bootstrapScript], {
      encoding: "utf8",
      env: { ...process.env, AXTASK_LOCAL_ENV_FILE: envFile },
    });
    expect(r.status).toBe(0);
    const out = fs.readFileSync(envFile, "utf8");
    expect(out).toContain("FOO=bar");
    expect(out).not.toContain("replace-with");
    const m = /^SESSION_SECRET=(.+)$/m.exec(out);
    expect(m?.[1]?.length ?? 0).toBeGreaterThanOrEqual(32);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("bootstrap leaves an already-strong SESSION_SECRET unchanged", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "axtask-lsb2-"));
    const envFile = path.join(dir, ".env");
    const existing = "x".repeat(40);
    fs.writeFileSync(envFile, `SESSION_SECRET=${existing}\n`, "utf8");
    const r = spawnSync(process.execPath, [bootstrapScript], {
      encoding: "utf8",
      env: { ...process.env, AXTASK_LOCAL_ENV_FILE: envFile },
    });
    expect(r.status).toBe(0);
    expect(fs.readFileSync(envFile, "utf8").trim()).toBe(`SESSION_SECRET=${existing}`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("seed-dev hints local secrets bootstrap when SESSION_SECRET weak", () => {
    const seed = fs.readFileSync(path.join(projectRoot, "server", "seed-dev.ts"), "utf8");
    expect(seed).toContain("local:secrets-bootstrap");
    expect(seed).toContain("SESSION_SECRET is set in .env");
  });

  it("has a Windows one-click launcher", () => {
    const cmdPath = path.join(projectRoot, "start-offline.cmd");
    const content = fs.readFileSync(cmdPath, "utf8");

    expect(content).toContain("npm run offline:start");
  });

  it("includes a Windows desktop shortcut helper script", () => {
    const shortcutScriptPath = path.join(
      projectRoot,
      "tools",
      "local",
      "create-desktop-shortcut.ps1",
    );
    const content = fs.readFileSync(shortcutScriptPath, "utf8");

    expect(content).toContain("Start AxTask Offline.lnk");
    expect(content).toContain("start-offline.cmd");
  });
});
