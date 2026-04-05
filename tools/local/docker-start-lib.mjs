/**
 * Pure helpers for docker-start.mjs (unit-tested).
 */
import path from "path";

/** @typedef {"session_secret" | "placeholder"} EnvDockerValidationError */

/**
 * @param {string[]} argv process.argv slice (e.g. process.argv.slice(2))
 */
export function parseDockerUpArgv(argv) {
  return {
    noLaunch: argv.includes("--no-launch"),
    noBuild: argv.includes("--no-build"),
    withNodeweaver: argv.includes("--with-nodeweaver"),
  };
}

/**
 * Minimal `.env`-style parser (KEY=VALUE, # comments, optional quotes).
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnvAssignmentLines(text) {
  /** @type {Record<string, string>} */
  const map = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return map;
}

/**
 * @param {string} envDockerText full `.env.docker` file contents
 * @returns {{ email: string; password: string } | { email: string; passwordMissing: true } | null}
 */
export function readDockerDemoLoginFromEnvText(envDockerText) {
  const map = parseEnvAssignmentLines(envDockerText);
  const on =
    map.AXTASK_DOCKER_SEED_DEMO === "1" ||
    String(map.AXTASK_DOCKER_SEED_DEMO || "").toLowerCase() === "true";
  if (!on) return null;
  const email = (map.DOCKER_DEMO_USER_EMAIL || "demo@axtask.local").trim();
  const password = map.DOCKER_DEMO_PASSWORD?.trim();
  if (!password) return { email, passwordMissing: true };
  return { email, password };
}

/**
 * @param {string} text full .env.docker file contents
 * @returns {EnvDockerValidationError | null} null when valid
 */
export function validateEnvDockerText(text) {
  if (text.includes("replace-with-32-plus-char-secret")) {
    return "session_secret";
  }
  if (text.includes("replace-me")) {
    return "placeholder";
  }
  return null;
}

/**
 * Detect a common docker migrate failure pattern where Postgres rejects creds.
 * This usually means DATABASE_URL creds do not match the DB user password,
 * or a persisted DB volume still uses older credentials.
 *
 * @param {string} logText
 * @returns {boolean}
 */
export function detectMigrateAuthFailure(logText) {
  if (!logText) return false;
  const t = String(logText).toLowerCase();
  return (
    t.includes("password authentication failed") &&
    t.includes("axtask-migrate")
  );
}

/**
 * Windows Docker Desktop install paths (may not exist on disk).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export function dockerDesktopExeCandidates(env = process.env) {
  const j = path.win32.join;
  const list = [];
  if (env.ProgramFiles) {
    list.push(j(env.ProgramFiles, "Docker", "Docker", "Docker Desktop.exe"));
  }
  if (env["ProgramFiles(x86)"]) {
    list.push(
      j(env["ProgramFiles(x86)"], "Docker", "Docker", "Docker Desktop.exe"),
    );
  }
  if (env.LOCALAPPDATA) {
    list.push(j(env.LOCALAPPDATA, "Docker", "Docker Desktop.exe"));
  }
  return list.filter(Boolean);
}

/**
 * @param {string[]} candidates from dockerDesktopExeCandidates
 * @param {(p: string) => boolean} existsSync
 * @returns {string | null}
 */
export function firstExistingPath(candidates, existsSync) {
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}
