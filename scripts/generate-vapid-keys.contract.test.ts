// @vitest-environment node
/**
 * Guards the VAPID key generator so operators have a stable provisioning path
 * for enabling Web Push on every device. See docs/NOTIFICATIONS_AND_PUSH.md.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const scriptPath = path.join(root, "scripts", "generate-vapid-keys.mjs");
const scriptSrc = fs.readFileSync(scriptPath, "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

describe("generate-vapid-keys provisioning contract", () => {
  it("package.json exposes vapid:generate script pointing at generate-vapid-keys.mjs", () => {
    expect(pkg.scripts["vapid:generate"]).toBe("node scripts/generate-vapid-keys.mjs");
  });

  it("script imports web-push and calls generateVAPIDKeys", () => {
    expect(scriptSrc).toMatch(/from\s+"web-push"/);
    expect(scriptSrc).toMatch(/generateVAPIDKeys\s*\(\s*\)/);
  });

  it("script prints all four env-var lines the operator needs (uncommented)", () => {
    expect(scriptSrc).toContain("VAPID_PUBLIC_KEY=");
    expect(scriptSrc).toContain("VAPID_PRIVATE_KEY=");
    expect(scriptSrc).toContain("VAPID_SUBJECT=");
    expect(scriptSrc).toContain("VITE_VAPID_PUBLIC_KEY=");
  });

  it("does not emit VITE_VAPID_PUBLIC_KEY as a commented-out (optional) line", () => {
    const commentedMatches = scriptSrc.match(/#\s*VITE_VAPID_PUBLIC_KEY=/g);
    expect(
      commentedMatches,
      "VITE_VAPID_PUBLIC_KEY must be emitted uncommented so operators don't have to edit the generator output.",
    ).toBeNull();
  });

  it("emits VITE_VAPID_PUBLIC_KEY from the same template value as VAPID_PUBLIC_KEY", () => {
    const publicLine = scriptSrc.match(/`VAPID_PUBLIC_KEY=\$\{(\w+)\}/);
    const viteLine = scriptSrc.match(/`VITE_VAPID_PUBLIC_KEY=\$\{(\w+)\}/);
    expect(publicLine, "VAPID_PUBLIC_KEY must be interpolated from a variable").toBeTruthy();
    expect(viteLine, "VITE_VAPID_PUBLIC_KEY must be interpolated from a variable").toBeTruthy();
    expect(
      viteLine![1],
      "VITE_VAPID_PUBLIC_KEY must reference the same publicKey variable so the two lines can never drift.",
    ).toBe(publicLine![1]);
  });

  it("script supports a --subject override and defaults to mailto:alerts@axtask.app", () => {
    expect(scriptSrc).toContain("--subject");
    expect(scriptSrc).toContain("mailto:alerts@axtask.app");
  });

  it("script does not write the private key to disk (stdout only)", () => {
    expect(scriptSrc).not.toMatch(/fs\.(write|append)File(Sync)?\s*\(/);
    expect(scriptSrc).toMatch(/process\.stdout\.write/);
  });

  it("web-push is a direct dependency so the script works after npm ci", () => {
    const inDeps = Boolean(pkg.dependencies && pkg.dependencies["web-push"]);
    expect(inDeps, "web-push must be in dependencies (not devDependencies) to survive production builds").toBe(true);
  });
});
