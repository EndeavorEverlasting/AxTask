// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `getOfflineSkillTree` must stay aligned with `getAvatarSkillTree` DTO fields so the
 * client can render effects without throwing (formatSkillEffect needs effectType).
 */
describe("getOfflineSkillTree contract", () => {
  const storageSrc = fs.readFileSync(path.resolve(__dirname, "storage.ts"), "utf8");

  it("self-heals via seedOfflineSkillTree before reading nodes", () => {
    const fnStart = storageSrc.indexOf("export async function getOfflineSkillTree");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBlock = storageSrc.slice(fnStart, fnStart + 800);
    expect(fnBlock).toMatch(/await\s+seedOfflineSkillTree\s*\(\s*\)/);
  });

  it("maps effectType and effectPerLevel from offline skill nodes", () => {
    const fnStart = storageSrc.indexOf("export async function getOfflineSkillTree");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBlock = storageSrc.slice(fnStart, fnStart + 3500);
    expect(fnBlock).toContain("effectType: node.effectType");
    expect(fnBlock).toContain("effectPerLevel: node.effectPerLevel");
  });
});
