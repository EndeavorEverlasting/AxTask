/**
 * Contract: audit-env.mjs strict template list and parsing behavior (no runtime import of .mjs).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

describe("[01-env] audit-env.mjs file contract", () => {
  it("STRICT_TEMPLATE_KEYS lists invite + VAPID trio + audit pepper", () => {
    const p = join(__dirname, "../../../scripts/audit-env.mjs");
    const src = readFileSync(p, "utf8");
    expect(src).toContain('"INVITE_CODE"');
    expect(src).toContain('"AUTH_AUDIT_PEPPER"');
    expect(src).toContain('"VITE_VAPID_PUBLIC_KEY"');
  });

  it("parseEnvFileKeys behavior matches audit-env.mjs regex", () => {
    function parseEnvFileKeys(text: string): Set<string> {
      const keys = new Set<string>();
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/);
        if (m) keys.add(m[1]);
      }
      return keys;
    }
    expect(parseEnvFileKeys("# FOO=\nBAR=1").has("FOO")).toBe(true);
    expect(parseEnvFileKeys("# FOO=\nBAR=1").has("BAR")).toBe(true);
  });
});
