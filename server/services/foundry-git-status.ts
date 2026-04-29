import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 12_000;

type DeployManifest = {
  generatedAt?: string | null;
  buildId?: string | null;
  commitSha?: string | null;
  branch?: string | null;
  provider?: string | null;
};

function readDeployManifest(cwd: string): DeployManifest | null {
  try {
    const p = path.join(cwd, "dist", "deploy-manifest.json");
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as DeployManifest;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export type FoundryGitStatusPayload =
  | {
      branch: string;
      commitSha: string;
      upstream: string | null;
      ahead: number;
      behind: number;
      statusShort: string;
      porcelainLines: string[];
      porcelainTruncated: boolean;
      deployManifest: DeployManifest | null;
    }
  | {
      error: string;
      deployManifest: DeployManifest | null;
    };

/**
 * Read-only git snapshot for Admin Foundry. Runs from `cwd` (typically repo root).
 */
export async function collectFoundryGitStatus(cwd: string): Promise<FoundryGitStatusPayload> {
  const deployManifest = readDeployManifest(cwd);
  const opts = { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 512_000 };
  try {
    const [{ stdout: branchOut }, { stdout: shaOut }, { stdout: statusSb }, { stdout: porcelainOut }] =
      await Promise.all([
        execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], opts),
        execFileAsync("git", ["rev-parse", "HEAD"], opts),
        execFileAsync("git", ["status", "-sb"], opts),
        execFileAsync("git", ["status", "--porcelain"], opts),
      ]);

    let upstream: string | null = null;
    try {
      const u = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "@{u}"], opts);
      upstream = String(u.stdout).trim() || null;
    } catch {
      upstream = null;
    }

    let ahead = 0;
    let behind = 0;
    try {
      const ab = await execFileAsync("git", ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"], opts);
      const parts = String(ab.stdout).trim().split(/\s+/);
      if (parts.length >= 2) {
        behind = Number.parseInt(parts[0]!, 10) || 0;
        ahead = Number.parseInt(parts[1]!, 10) || 0;
      }
    } catch {
      ahead = 0;
      behind = 0;
    }

    const lines = String(porcelainOut).split("\n").filter(Boolean);
    const maxLines = 80;
    const porcelainLines = lines.slice(0, maxLines);

    return {
      branch: String(branchOut).trim() || deployManifest?.branch || "unknown",
      commitSha: String(shaOut).trim() || deployManifest?.commitSha || "unknown",
      upstream,
      ahead,
      behind,
      statusShort: String(statusSb).trim(),
      porcelainLines,
      porcelainTruncated: lines.length > porcelainLines.length,
      deployManifest,
    };
  } catch (err) {
    if (deployManifest) {
      return {
        branch: deployManifest.branch || "unknown",
        commitSha: deployManifest.commitSha || "unknown",
        upstream: null,
        ahead: 0,
        behind: 0,
        statusShort: "git unavailable; using deploy manifest",
        porcelainLines: [],
        porcelainTruncated: false,
        deployManifest,
      };
    }
    return { error: err instanceof Error ? err.message : String(err), deployManifest };
  }
}
