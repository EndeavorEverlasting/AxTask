// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("App.tsx admin route chunk", () => {
  it("lazy-loads Security Admin (no static import of pages/admin)", () => {
    const appPath = path.join(__dirname, "App.tsx");
    const src = fs.readFileSync(appPath, "utf8");
    expect(src).not.toMatch(/import\s+AdminPage\s+from\s+["']@\/pages\/admin["']/);
    expect(src).toMatch(/lazy\s*\(\s*\(\)\s*=>\s*import\s*\(\s*["']@\/pages\/admin["']\s*\)/);
  });
});
