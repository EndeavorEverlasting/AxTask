/**
 * Helpers for the local Docker setup GUI wizard.
 */
import { parseEnvAssignmentLines } from "./docker-start-lib.mjs";

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalize line endings to LF so env key replacement stays line-safe.
 * @param {string} text
 * @returns {string}
 */
export function normalizeEnvText(text) {
  return String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Double-quote and escape a value for a single-line KEY="..." .env assignment.
 * @param {string} value
 * @returns {string}
 */
function encodeEnvValue(value) {
  const s = String(value);
  const escaped = s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
  return `"${escaped}"`;
}

/**
 * @param {string} databaseUrl
 * @param {string} newPassword
 * @returns {string}
 */
export function syncDatabaseUrlPassword(databaseUrl, newPassword) {
  if (!databaseUrl || !newPassword) return databaseUrl;
  try {
    const u = new URL(databaseUrl);
    if (!u.username) return databaseUrl;
    u.password = newPassword;
    return u.toString();
  } catch {
    return databaseUrl;
  }
}

/**
 * Replace or append KEY=value in .env-style text.
 * @param {string} text
 * @param {string} key
 * @param {string} value
 * @returns {string}
 */
export function upsertEnvKey(text, key, value) {
  const safeKey = escapeRegex(key);
  const line = `${key}=${encodeEnvValue(value)}`;
  const re = new RegExp(`^\\s*${safeKey}\\s*=.*$`, "m");
  if (re.test(text)) {
    return text.replace(re, line);
  }
  const needsNewline = text.length > 0 && !text.endsWith("\n");
  return `${text}${needsNewline ? "\n" : ""}${line}\n`;
}

/**
 * Apply GUI form values onto env text.
 * @param {string} baseText
 * @param {{
 *   POSTGRES_PASSWORD: string;
 *   SESSION_SECRET: string;
 *   AXTASK_DOCKER_SEED_DEMO: string;
 *   DOCKER_DEMO_USER_EMAIL: string;
 *   DOCKER_DEMO_PASSWORD: string;
 * }} values
 * @returns {string}
 */
export function applyDockerGuiValues(baseText, values) {
  const normalizedBase = normalizeEnvText(baseText);
  const parsed = parseEnvAssignmentLines(normalizedBase);
  const currentDbUrl = parsed.DATABASE_URL || "";
  const nextDbUrl = syncDatabaseUrlPassword(
    currentDbUrl,
    values.POSTGRES_PASSWORD,
  );

  let next = normalizedBase;
  next = upsertEnvKey(next, "POSTGRES_PASSWORD", values.POSTGRES_PASSWORD);
  next = upsertEnvKey(next, "SESSION_SECRET", values.SESSION_SECRET);
  next = upsertEnvKey(
    next,
    "AXTASK_DOCKER_SEED_DEMO",
    values.AXTASK_DOCKER_SEED_DEMO,
  );
  next = upsertEnvKey(
    next,
    "DOCKER_DEMO_USER_EMAIL",
    values.DOCKER_DEMO_USER_EMAIL,
  );
  next = upsertEnvKey(
    next,
    "DOCKER_DEMO_PASSWORD",
    values.DOCKER_DEMO_PASSWORD,
  );
  if (nextDbUrl) {
    next = upsertEnvKey(next, "DATABASE_URL", nextDbUrl);
  }
  return next;
}

/**
 * @param {string} s
 * @returns {boolean} true when the string contains characters unsafe for .env lines
 */
function hasForbiddenEnvChars(s) {
  return /[\r\n\x00]/.test(String(s));
}

/**
 * @param {Record<string, string>} formData
 * @returns {string | null} error message, or null when valid
 */
export function validateDockerGuiValues(formData) {
  const postgresPassword = String(formData.POSTGRES_PASSWORD || "").trim();
  const sessionSecret = String(formData.SESSION_SECRET || "").trim();
  const demoEnabled = String(formData.AXTASK_DOCKER_SEED_DEMO || "0") === "1";
  const demoPassword = String(formData.DOCKER_DEMO_PASSWORD || "").trim();
  const demoEmail = String(formData.DOCKER_DEMO_USER_EMAIL || "").trim();
  if (
    hasForbiddenEnvChars(postgresPassword) ||
    hasForbiddenEnvChars(sessionSecret) ||
    hasForbiddenEnvChars(demoPassword) ||
    hasForbiddenEnvChars(demoEmail)
  ) {
    return "Values cannot contain line breaks or null bytes.";
  }
  if (!postgresPassword) {
    return "POSTGRES_PASSWORD is required.";
  }
  if (sessionSecret.length < 32) {
    return "SESSION_SECRET must be at least 32 characters.";
  }
  if (demoEnabled && demoPassword.length < 8) {
    return "DOCKER_DEMO_PASSWORD must be at least 8 characters when demo seeding is enabled.";
  }
  return null;
}
