import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  detectCollisions,
  inspectPrCollisions,
  isHighRiskPath,
  pathsOverlap,
  parsePlannedLanes,
  sanitizeUrl,
} from "../../scripts/ai-harness/inspect-pr-collisions.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..", "..");

describe("PR Collision Inspection Contract", () => {
  it("sanitizes URLs and credential-bearing strings", () => {
    expect(sanitizeUrl("https://user:secret-token@github.com/repo.git")).toBe("https://***@github.com/repo.git");
    expect(sanitizeUrl("https://github.com/repo.git")).toBe("https://github.com/repo.git");
    expect(sanitizeUrl(null)).toBe("");
  });

  it("identifies high-risk paths correctly", () => {
    expect(isHighRiskPath("package.json")).toBe(true);
    expect(isHighRiskPath("server/routes.ts")).toBe(true);
    expect(isHighRiskPath("shared/schema.ts")).toBe(true);
    expect(isHighRiskPath("client/src/components/button.tsx")).toBe(false);
  });

  it("detects exact, glob, and directory path overlaps", () => {
    expect(pathsOverlap("client/src/pages/backup.tsx", "client/src/pages/backup.tsx")).toBe(true);
    expect(pathsOverlap("client/src/components/backup/**", "client/src/components/backup/backup-status.tsx")).toBe(true);
    expect(pathsOverlap("client/src/components/backup", "client/src/components/backup/backup-status.tsx")).toBe(true);
    expect(pathsOverlap("client/src/pages/backup.tsx", "client/src/pages/skill-tree.tsx")).toBe(false);
  });

  it("returns zero collisions when lanes are completely decoupled", () => {
    const lanes = [
      {
        laneId: "lane-1",
        branch: "feat/feature-1",
        source: "planned-sprint",
        ownedPaths: ["client/src/components/feature-1.tsx"],
      },
      {
        laneId: "lane-2",
        branch: "feat/feature-2",
        source: "planned-sprint",
        ownedPaths: ["server/routes/feature-2.ts"],
      },
    ];

    const collisions = detectCollisions(lanes);
    expect(collisions).toEqual([]);
  });

  it("detects exact path collision and ranks risk as high", () => {
    const lanes = [
      {
        laneId: "lane-1",
        branch: "feat/feature-1",
        source: "planned-sprint",
        ownedPaths: ["client/src/pages/settings.tsx"],
      },
      {
        laneId: "lane-2",
        branch: "feat/feature-2",
        source: "planned-sprint",
        ownedPaths: ["client/src/pages/settings.tsx"],
      },
    ];

    const collisions = detectCollisions(lanes);
    expect(collisions.length).toBe(1);
    expect(collisions[0].riskRank).toBe("high");
    expect(collisions[0].lanesInvolved).toEqual(["lane-1", "lane-2"]);
    expect(collisions[0].overlappingPaths).toContain("client/src/pages/settings.tsx");
  });

  it("detects high-risk shared file collision and ranks risk as critical", () => {
    const lanes = [
      {
        laneId: "lane-1",
        branch: "feat/deps-1",
        source: "planned-sprint",
        ownedPaths: ["package.json"],
      },
      {
        laneId: "lane-2",
        branch: "feat/deps-2",
        source: "planned-sprint",
        ownedPaths: ["package.json"],
      },
    ];

    const collisions = detectCollisions(lanes);
    expect(collisions.length).toBe(1);
    expect(collisions[0].riskRank).toBe("critical");
    expect(collisions[0].recommendedAction).toContain("High-risk surface overlap detected");
  });

  it("handles malformed planned ownership input gracefully", () => {
    expect(parsePlannedLanes("invalid-json")).toEqual(expect.any(Array));
    expect(parsePlannedLanes(null)).toEqual(expect.any(Array));
    expect(parsePlannedLanes([])).toEqual([]);
  });

  it("runs full inspection with mock PR data and produces deterministic ledger", () => {
    const mockPrs = [
      {
        number: 85,
        title: "fix(db): harden backup airlock",
        headRefName: "fix/2026-07-18-db-airlock-windows-smoke",
        baseRefName: "main",
        files: ["server/account-backup.ts", "package.json"],
      },
    ];

    const ledger = inspectPrCollisions(REPO_ROOT, {
      openPrsJson: mockPrs,
      nowIso: "2026-07-22T20:00:00.000Z",
    });

    expect(ledger.schemaVersion).toBe(1);
    expect(ledger.ledgerId).toBe("axtask.collision-ledger.v1");
    expect(ledger.degradedMode).toBe(false);
    expect(ledger.collisions.length).toBeGreaterThan(0);
    expect(ledger.overallRisk).toBe("high");
  });
});
