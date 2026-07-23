#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const DEFAULT_RUNS_DIR = ".ai/runs";

export const HIGH_RISK_PATTERNS = [
  "package.json",
  "package-lock.json",
  "client/src/App.tsx",
  "server/routes.ts",
  "shared/schema.ts",
  "drizzle.config.ts",
  "render.yaml",
  "README.md",
  "AGENTS.md",
];

export const DEFAULT_PLANNED_LANES = [
  {
    laneId: "P01-backup-center",
    branch: "feat/backup-center-surface",
    source: "planned-sprint",
    ownedPaths: [
      "client/src/pages/backup.tsx",
      "client/src/pages/import-export.tsx",
      "client/src/components/backup/**",
      "client/src/lib/backup-api.ts",
      "client/src/components/navigation.tsx",
    ],
  },
  {
    laneId: "P02-skill-tree",
    branch: "feat/skill-tree-data-ux-completion",
    source: "planned-sprint",
    ownedPaths: [
      "shared/schema/gamification.ts",
      "client/src/pages/skill-tree.tsx",
      "client/src/components/skill-tree/**",
      "client/src/lib/skill-tree-*",
      "server/routes/skill-tree.ts",
    ],
  },
  {
    laneId: "P03-backup-certification",
    branch: "cert/backup-restore-local-runtime",
    source: "planned-sprint",
    ownedPaths: [
      "scripts/backup/**",
      "server/account-backup.ts",
      ".ai/workflows/local-deployment-certification.md",
      ".ai/skills/runtime-proof.md",
    ],
  },
];

export function sanitizeUrl(value) {
  if (typeof value !== "string") return "";
  return value.replace(/https?:\/\/[^@\s]+@/g, "https://***@");
}

export function normalizeRepoPath(value) {
  return String(value ?? "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .trim();
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

export function globToRegExp(pattern) {
  const normalized = normalizeRepoPath(pattern);
  let source = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === "*") {
      if (normalized[index + 1] === "*") {
        const followedBySlash = normalized[index + 2] === "/";
        source += followedBySlash ? "(?:.*/)?" : ".*";
        index += followedBySlash ? 2 : 1;
      } else {
        source += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    source += escapeRegex(char);
  }
  return new RegExp(`^${source}$`);
}

export function pathsOverlap(pathA, pathB) {
  const normA = normalizeRepoPath(pathA);
  const normB = normalizeRepoPath(pathB);

  if (!normA || !normB) return false;
  if (normA === normB) return true;

  if (normA.includes("*") || normB.includes("*")) {
    const regA = globToRegExp(normA);
    const regB = globToRegExp(normB);
    return regA.test(normB) || regB.test(normA);
  }

  const isDirA = normA.endsWith("/") || !path.extname(normA);
  const isDirB = normB.endsWith("/") || !path.extname(normB);

  if (isDirA && (normB.startsWith(normA + "/") || normB === normA)) return true;
  if (isDirB && (normA.startsWith(normB + "/") || normA === normB)) return true;

  return false;
}

export function isHighRiskPath(filePath) {
  const norm = normalizeRepoPath(filePath);
  return HIGH_RISK_PATTERNS.some((pattern) => norm === pattern || norm.endsWith("/" + pattern));
}

export function detectCollisions(lanes) {
  const collisions = [];
  const processedPairs = new Set();

  for (let i = 0; i < lanes.length; i += 1) {
    for (let j = i + 1; j < lanes.length; j += 1) {
      const laneA = lanes[i];
      const laneB = lanes[j];

      const pairKey = [laneA.laneId, laneB.laneId].sort().join("::");
      if (processedPairs.has(pairKey)) continue;
      processedPairs.add(pairKey);

      const pathsA = [...(laneA.ownedPaths || []), ...(laneA.changedPaths || [])];
      const pathsB = [...(laneB.ownedPaths || []), ...(laneB.changedPaths || [])];

      const overlappingPaths = [];
      let isExact = false;
      let containsHighRisk = false;

      for (const pA of pathsA) {
        for (const pB of pathsB) {
          if (pathsOverlap(pA, pB)) {
            const labelA = normalizeRepoPath(pA);
            const labelB = normalizeRepoPath(pB);
            const pathLabel = labelA === labelB ? labelA : `${labelA} <=> ${labelB}`;
            if (!overlappingPaths.includes(pathLabel)) {
              overlappingPaths.push(pathLabel);
            }
            if (labelA === labelB) isExact = true;
            if (isHighRiskPath(pA) || isHighRiskPath(pB)) containsHighRisk = true;
          }
        }
      }

      if (overlappingPaths.length > 0) {
        let riskRank = "low";
        let recommendedAction = "Review and coordinate changed files between lanes.";

        if (containsHighRisk) {
          riskRank = "critical";
          recommendedAction = "High-risk surface overlap detected. Sequenced execution or explicit file partitioning required before PR merge.";
        } else if (isExact) {
          riskRank = "high";
          recommendedAction = "Exact file overlap detected. Assign explicit file ownership or rebase feature branch onto target base.";
        } else {
          riskRank = "medium";
          recommendedAction = "Sub-directory or sibling path overlap detected. Ensure independent commits do not disrupt shared directory structure.";
        }

        collisions.push({
          collisionId: `col-${laneA.laneId}-${laneB.laneId}`,
          riskRank,
          overlappingPaths: overlappingPaths.sort(),
          lanesInvolved: [laneA.laneId, laneB.laneId],
          recommendedAction,
          evidenceSource: laneA.source === "github-pr" || laneB.source === "github-pr" ? "github-api" : "local-inspection",
        });
      }
    }
  }

  return collisions.sort((a, b) => a.collisionId.localeCompare(b.collisionId));
}

export function fetchOpenPrLanes(rootDir, overrideJson = null) {
  if (overrideJson) {
    try {
      const data = typeof overrideJson === "string" ? JSON.parse(overrideJson) : overrideJson;
      return {
        lanes: data.map((pr) => ({
          laneId: `PR-#${pr.number}`,
          branch: pr.headRefName || `pr-${pr.number}`,
          prNumber: pr.number,
          source: "github-pr",
          ownedPaths: pr.files || pr.changedPaths || [],
          changedPaths: pr.files || pr.changedPaths || [],
        })),
        degradedMode: false,
        degradedReason: null,
      };
    } catch (err) {
      return {
        lanes: [],
        degradedMode: true,
        degradedReason: `Failed to parse PR JSON override: ${err.message}`,
      };
    }
  }

  try {
    const listOutput = execFileSync(
      "gh",
      ["pr", "list", "--state", "open", "--limit", "100", "--json", "number,title,headRefName,baseRefName,isDraft"],
      { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const prs = JSON.parse(listOutput);
    const lanes = [];

    for (const pr of prs) {
      let changedFiles = [];
      try {
        const diffOutput = execFileSync("gh", ["pr", "diff", String(pr.number), "--name-only"], {
          cwd: rootDir,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        });
        changedFiles = diffOutput
          .split(/\r?\n/)
          .map(normalizeRepoPath)
          .filter((line) => line.length > 0);
      } catch {
        // Degraded per-PR file inspection
      }

      lanes.push({
        laneId: `PR-#${pr.number}`,
        branch: pr.headRefName || `pr-${pr.number}`,
        prNumber: pr.number,
        source: "github-pr",
        ownedPaths: changedFiles,
        changedPaths: changedFiles,
      });
    }

    return { lanes, degradedMode: false, degradedReason: null };
  } catch (err) {
    return {
      lanes: [],
      degradedMode: true,
      degradedReason: `gh CLI unauthenticated or unavailable: ${err.message}`,
    };
  }
}

export function parsePlannedLanes(overridePlanned) {
  if (!overridePlanned) return DEFAULT_PLANNED_LANES;
  try {
    const data = typeof overridePlanned === "string" ? JSON.parse(overridePlanned) : overridePlanned;
    if (Array.isArray(data)) {
      return data.map((lane, idx) => ({
        laneId: lane.laneId || lane.id || `planned-${idx + 1}`,
        branch: lane.branch || `branch-${idx + 1}`,
        source: "planned-sprint",
        ownedPaths: (lane.ownedPaths || lane.paths || []).map(normalizeRepoPath),
      }));
    }
    return DEFAULT_PLANNED_LANES;
  } catch {
    return DEFAULT_PLANNED_LANES;
  }
}

export function inspectPrCollisions(rootDir = DEFAULT_REPO_ROOT, options = {}) {
  const baseRef = options.baseRef || "main";
  let baseSha = "0000000000000000000000000000000000000000";

  try {
    baseSha = execFileSync("git", ["rev-parse", baseRef], { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    // Git fallback
  }

  const { lanes: prLanes, degradedMode, degradedReason } = fetchOpenPrLanes(rootDir, options.openPrsJson);
  const plannedLanes = parsePlannedLanes(options.planned);

  const allLanes = [...plannedLanes, ...prLanes];
  const collisions = detectCollisions(allLanes);

  let overallRisk = "clean";
  if (collisions.some((c) => c.riskRank === "critical")) {
    overallRisk = "blocking";
  } else if (collisions.some((c) => c.riskRank === "high")) {
    overallRisk = "high";
  } else if (collisions.some((c) => c.riskRank === "medium")) {
    overallRisk = "medium";
  } else if (collisions.length > 0) {
    overallRisk = "low";
  }

  const ledger = {
    schemaVersion: 1,
    authorityRef: "axtask.agent-authority.v1",
    ledgerId: "axtask.collision-ledger.v1",
    baseRef,
    baseSha,
    inspectedAt: options.nowIso || new Date().toISOString(),
    lanes: allLanes,
    collisions,
    degradedMode,
    degradedReason: degradedReason || null,
    overallRisk,
  };

  return ledger;
}

export function formatCollisionReport(ledger) {
  const lines = [
    `=== PR Collision Inspection Ledger ===`,
    `Base Ref: ${ledger.baseRef} (${ledger.baseSha.slice(0, 7)})`,
    `Inspected At: ${ledger.inspectedAt}`,
    `Overall Risk: ${ledger.overallRisk.toUpperCase()}`,
    `Degraded Mode: ${ledger.degradedMode ? `YES (${ledger.degradedReason})` : "NO"}`,
    `Lanes Analyzed (${ledger.lanes.length}):`,
  ];

  for (const lane of ledger.lanes) {
    lines.push(`  - [${lane.source}] ${lane.laneId} (${lane.branch}): ${(lane.ownedPaths || []).length} paths`);
  }

  lines.push(`Collisions Detected (${ledger.collisions.length}):`);
  if (ledger.collisions.length === 0) {
    lines.push(`  (None) - All planned lanes and open PRs are decoupled.`);
  } else {
    for (const c of ledger.collisions) {
      lines.push(`  - [${c.riskRank.toUpperCase()}] ${c.collisionId} (${c.lanesInvolved.join(" vs ")})`);
      lines.push(`    Overlapping: ${c.overlappingPaths.join(", ")}`);
      lines.push(`    Action: ${c.recommendedAction}`);
    }
  }

  return lines.join("\n");
}

function parseCliArgs(argv) {
  const options = {
    baseRef: "main",
    outputPath: null,
    planned: null,
    openPrsJson: null,
    failOnCollision: false,
    json: false,
    rootDir: DEFAULT_REPO_ROOT,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--base" && next) {
      options.baseRef = next;
      i += 1;
    } else if (arg === "--output" && next) {
      options.outputPath = next;
      i += 1;
    } else if (arg === "--planned" && next) {
      options.planned = next;
      i += 1;
    } else if (arg === "--open-prs-json" && next) {
      options.openPrsJson = next;
      i += 1;
    } else if (arg === "--fail-on-collision") {
      options.failOnCollision = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--repo-root" && next) {
      options.rootDir = path.resolve(next);
      i += 1;
    } else if (arg === "-h" || arg === "--help") {
      options.help = true;
    }
  }

  return options;
}

function usage() {
  return [
    "Usage: node scripts/ai-harness/inspect-pr-collisions.mjs [options]",
    "",
    "Options:",
    "  --base <ref>          Base git ref to inspect against (default: main)",
    "  --output <path>       Write JSON ledger to file under .ai/runs/",
    "  --planned <json|path> Planned sprint lane ownership configuration",
    "  --open-prs-json <json>Override GitHub open PR data (for testing/offline)",
    "  --fail-on-collision   Exit non-zero if blocking or critical collision found",
    "  --json                Emit raw JSON output to stdout",
    "  --repo-root <path>    Override repository root path",
    "  -h, --help            Show this help message",
  ].join("\n");
}

function main() {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }

    if (options.planned && fs.existsSync(options.planned)) {
      options.planned = fs.readFileSync(options.planned, "utf8");
    }
    if (options.openPrsJson && fs.existsSync(options.openPrsJson)) {
      options.openPrsJson = fs.readFileSync(options.openPrsJson, "utf8");
    }

    const ledger = inspectPrCollisions(options.rootDir, options);

    if (options.outputPath) {
      const absoluteOutput = path.resolve(options.rootDir, options.outputPath);
      fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
      fs.writeFileSync(absoluteOutput, JSON.stringify(ledger, null, 2) + "\n", "utf8");
    }

    if (options.json) {
      console.log(JSON.stringify(ledger, null, 2));
    } else {
      console.log(formatCollisionReport(ledger));
    }

    if (options.failOnCollision && (ledger.overallRisk === "blocking" || ledger.overallRisk === "critical")) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`[pr-collision-inspection] FAIL ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
