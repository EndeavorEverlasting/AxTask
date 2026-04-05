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
