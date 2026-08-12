import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROUTING_OVERRIDE_KEYS = new Set(["host", "hostaddr", "port", "dbname", "database", "service", "servicefile"]);

/** Normalize URL.hostname across bracketed and unbracketed IP literals. */
export function normalizePgHostname(hostname) {
  return String(hostname ?? "").trim().toLowerCase().replace(/^\[(.*)\]$/, "$1");
}

/** Reject URI query parameters that can redirect a connection away from its authority/path target. */
export function assertNoDatabaseTargetOverrides(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const overrides = [...parsed.searchParams.keys()].filter((key) => ROUTING_OVERRIDE_KEYS.has(key.toLowerCase()));
  if (overrides.length > 0) {
    throw new Error(`database URL contains forbidden connection-target override(s): ${[...new Set(overrides)].join(", ")}`);
  }
  return parsed;
}

export function isLoopbackDatabaseUrl(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const host = normalizePgHostname(parsed.hostname);
  return ["localhost", "127.0.0.1", "::1"].includes(host);
}

/** Return a stable, non-secret fingerprint for a PostgreSQL target. */
export function databaseTargetFingerprint(databaseUrl) {
  const parsed = assertNoDatabaseTargetOverrides(databaseUrl);
  const port = parsed.port || "5432";
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const identity = `${normalizePgHostname(parsed.hostname)}:${port}/${databaseName}`;
  return createHash("sha256").update(identity, "utf8").digest("hex");
}

/** Resolve the configured local-backup root without treating the selector as a path. */
export function resolveBackupStorageRoot({ cwd = process.cwd(), env = process.env } = {}) {
  const configured = String(env.BACKUP_LOCAL_DIR ?? "").trim();
  return configured ? path.resolve(cwd, configured) : path.resolve(cwd, ".backups");
}

export function backupDbRoot(options = {}) {
  return path.join(resolveBackupStorageRoot(options), "db");
}

/** Run pg_dump / pg_restore; Windows PATH shims need shell fallback. */
export function runPgTool(tool, args, opts = {}) {
  const isWin = process.platform === "win32";
  if (isWin) {
    const where = spawnSync("where.exe", [tool], { encoding: "utf8" });
    const resolved = (where.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.toLowerCase().endsWith(".exe"));
    if (resolved) return spawnSync(resolved, args, { stdio: "inherit", ...opts });
    return spawnSync(tool, args, { stdio: "inherit", shell: true, ...opts });
  }
  return spawnSync(tool, args, { stdio: "inherit", ...opts });
}

/** Newest db manifest for generic airlock callers; recovery must bind an explicit path. */
export function latestDbManifest(root = backupDbRoot()) {
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

/** Recovery restores require the exact manifest path produced by their preflight run. */
export function resolveRestoreManifest({ explicitPath = null, recoveryMode = false, latestPath } = {}) {
  if (explicitPath) return explicitPath;
  if (recoveryMode) throw new Error("recovery restore requires --file=<exact manifest path>");
  return latestPath === undefined ? latestDbManifest() : latestPath;
}
