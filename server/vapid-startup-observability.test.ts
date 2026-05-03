// @vitest-environment node
/**
 * Guards the startup WARN that surfaces VAPID misconfiguration in deployed
 * environments (Render logs). Without this warning, deploys silently run with
 * push disabled and users only notice via the "in-app only" toast.
 * See docs/NOTIFICATIONS_AND_PUSH.md.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const indexSrc = fs.readFileSync(path.join(root, "server", "index.ts"), "utf8");

describe("VAPID startup observability", () => {
  it("declares a warnIfVapidMissing helper that is invoked at boot", () => {
    expect(indexSrc).toMatch(/function\s+warnIfVapidMissing\s*\(/);
    expect(indexSrc).toMatch(/warnIfVapidMissing\s*\(\s*\)\s*;/);
  });

  it("warning references both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY", () => {
    const fnStart = indexSrc.indexOf("function warnIfVapidMissing");
    expect(fnStart).toBeGreaterThan(-1);
    const braceOpen = indexSrc.indexOf("{", fnStart);
    let depth = 0;
    let i = braceOpen;
    for (; i < indexSrc.length; i++) {
      const ch = indexSrc[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const fnBody = indexSrc.slice(fnStart, i + 1);
    expect(fnBody).toContain("VAPID_PUBLIC_KEY");
    expect(fnBody).toContain("VAPID_PRIVATE_KEY");
    expect(fnBody).toMatch(/console\.warn/);
    expect(fnBody).toContain("[push]");
    expect(fnBody).toContain("vapid:generate");
  });

  it("does not throw or exit on missing keys (graceful fallback preserved)", () => {
    const fnStart = indexSrc.indexOf("function warnIfVapidMissing");
    const fnEnd = indexSrc.indexOf("\n}\n", fnStart);
    const fnBody = indexSrc.slice(fnStart, fnEnd + 2);
    expect(fnBody).not.toMatch(/throw\s+new\s+/);
    expect(fnBody).not.toMatch(/process\.exit/);
  });
});
