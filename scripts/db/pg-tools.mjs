import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Run pg_dump / pg_restore. On Windows, shell is required so PATH .cmd shims resolve.
 */
export function runPgTool(tool, args, opts = {}) {
  const isWin = process.platform === "win32";
  if (isWin) {
    const where = spawnSync("where.exe", [tool], { encoding: "utf8" });
    const resolved = (where.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.toLowerCase().endsWith(".exe"));
    if (resolved) {
      return spawnSync(resolved, args, { stdio: "inherit", ...opts });
    }
    return spawnSync(tool, args, { stdio: "inherit", shell: true, ...opts });
  }
  return spawnSync(tool, args, { stdio: "inherit", ...opts });
}

/** Newest db backup manifest under .backups/db by mtime (no bash dependency). */
export function latestDbManifest(root = path.resolve(process.cwd(), ".backups", "db")) {
  if (!existsSync(root)) return null;
  const manifests = [];
  for (const day of readdirSync(root)) {
    const dayDir = path.join(root, day);
    if (!statSync(dayDir).isDirectory()) continue;
    for (const name of readdirSync(dayDir)) {
      if (!name.endsWith(".manifest.json")) continue;
      const full = path.join(dayDir, name);
      manifests.push({ full, mtimeMs: statSync(full).mtimeMs });
    }
  }
  manifests.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return manifests[0]?.full ?? null;
}
