// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const projectRoot = path.resolve(__dirname, "..");

describe("offline one-click workflow assets", () => {
  it("has required local defaults in .env.example", () => {
    const envExamplePath = path.join(projectRoot, ".env.example");
    const content = fs.readFileSync(envExamplePath, "utf8");

    expect(content).toContain("DATABASE_URL=");
    expect(content).toContain("SESSION_SECRET=");
    expect(content).toContain("NODE_ENV=development");
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
