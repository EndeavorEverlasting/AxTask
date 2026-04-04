// @vitest-environment node
/**
 * Regression tests for first-run / clone onboarding docs and scripts.
 * Catches Windows cmd vs Unix `cp` confusion and missing npm env-init wiring.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");

function readUtf8(rel: string): string {
  return fs.readFileSync(path.join(projectRoot, ...rel.split("/")), "utf8");
}

describe("local setup tutorial (README + scripts)", () => {
  const readme = readUtf8("README.md");

  it("documents Windows cmd not having cp and points to npm env-init", () => {
    expect(readme).toMatch(/Windows Command Prompt|cmd\.exe/i);
    expect(readme).toContain("'cp' is not recognized");
    expect(readme).toContain("npm run docker:env-init");
    expect(readme).toContain("npm run local:env-init");
  });

  it("documents Windows copy commands for .env.docker and .env", () => {
    expect(readme).toContain("copy .env.docker.example .env.docker");
    expect(readme).toContain("copy .env.example .env");
    expect(readme).toMatch(/Copy-Item \.env\.docker\.example/i);
    expect(readme).toMatch(/Copy-Item \.env\.example/i);
  });

  it("does not present Quick Start as a bash-only cp block without alternatives", () => {
    expect(readme).toContain("## Quick Start (Node.js + local PostgreSQL)");
    const quickIdx = readme.indexOf("## Quick Start (Node.js + local PostgreSQL)");
    const nextH2 = readme.indexOf("\n## ", quickIdx + 1);
    const quickSection = readme.slice(quickIdx, nextH2 === -1 ? undefined : nextH2);
    expect(quickSection).toContain("npm run local:env-init");
    expect(quickSection).not.toMatch(/```bash\nnpm install\ncp \.env\.example/);
  });

  it("wires local:env-init and docker:env-init in package.json", () => {
    const pkg = JSON.parse(readUtf8("package.json"));
    expect(pkg.scripts["local:env-init"]).toBe("node tools/local/copy-env-local.mjs");
    expect(pkg.scripts["docker:env-init"]).toBe("node tools/local/copy-env-docker.mjs");
  });

  it("ships copy-env-local and copy-env-docker helpers", () => {
    expect(fs.existsSync(path.join(projectRoot, "tools", "local", "copy-env-local.mjs"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(projectRoot, "tools", "local", "copy-env-docker.mjs"))).toBe(
      true,
    );
    const local = readUtf8("tools/local/copy-env-local.mjs");
    expect(local).toContain(".env.example");
    expect(local).toContain(".env");
    const docker = readUtf8("tools/local/copy-env-docker.mjs");
    expect(docker).toContain(".env.docker.example");
    expect(docker).toContain(".env.docker");
  });
});

describe("Replit workspace expectations (runs on Replit and in CI)", () => {
  it("keeps .replit dev entry and database module for hosted Postgres", () => {
    const replit = readUtf8(".replit");
    expect(replit).toContain("npm run dev");
    expect(replit).toContain("postgresql");
  });

  it("documents that tests guard onboarding docs", () => {
    const replitMd = readUtf8("replit.md");
    expect(replitMd).toContain("local-setup-tutorial.test.ts");
    expect(replitMd).toMatch(/local:env-init|docker:env-init/);
  });
});

describe("Docker foundation doc stays aligned with cross-platform env init", () => {
  it("prefers npm run docker:env-init and mentions Windows cmd", () => {
    const doc = readUtf8("docs/DOCKER_FOUNDATION.md");
    expect(doc).toContain("npm run docker:env-init");
    expect(doc).toMatch(/Windows.*cmd|cmd\*\*/i);
  });
});
