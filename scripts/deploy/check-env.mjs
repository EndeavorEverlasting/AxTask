/**
 * Validates required environment variables for a production deploy.
 * Runs before the app or migrations so the crash is near-instantaneous
 * and has a human-readable message, rather than being discovered deep
 * inside apply-migrations.mjs or server startup.
 *
 * Usage:
 *   node scripts/deploy/check-env.mjs [--prod|--dev]
 *
 * Environment:
 *   NODE_ENV   - If set to "production" the stricter checks apply.
 *   AXTASK_ENV_IGNORE_MISSING - comma-separated keys to skip (CI only)
 *
 * Exit codes:
 *   0 - all required vars present and well-formed
 *   1 - one or more required vars missing or invalid
 */

import { pathToFileURL } from "node:url";

const ALWAYS_REQUIRED = ["DATABASE_URL", "SESSION_SECRET"];

const PROD_REQUIRED = [
  "NODE_ENV",
  // NOTE: CANONICAL_HOST is "sync: false" in render.yaml but recommended
  // for production; we warn rather than hard-fail.
];

const PROD_RECOMMENDED = ["CANONICAL_HOST", "FORCE_HTTPS"];

// Minimum length for secret-ish values so obvious placeholders are caught.
const MIN_SECRET_LENGTH = 20;
const SECRET_KEYS = new Set([
  "SESSION_SECRET",
  "AUTH_AUDIT_PEPPER",
  "GOOGLE_CLIENT_SECRET",
  "WORKOS_API_KEY",
]);

export function validateEnv(env, { isProd } = { isProd: false }) {
  const errors = [];
  const warnings = [];
  const ignore = new Set(
    (env.AXTASK_ENV_IGNORE_MISSING || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const required = isProd
    ? [...ALWAYS_REQUIRED, ...PROD_REQUIRED]
    : ALWAYS_REQUIRED;

  for (const key of required) {
    if (ignore.has(key)) continue;
    const raw = env[key];
    if (raw === undefined || raw === null || raw === "") {
      errors.push(`${key} is not set`);
      continue;
    }
    if (SECRET_KEYS.has(key) && String(raw).length < MIN_SECRET_LENGTH) {
      errors.push(
        `${key} is too short (${String(raw).length} chars, need >= ${MIN_SECRET_LENGTH})`,
      );
    }
    if (key === "DATABASE_URL") {
      if (!/^postgres(ql)?:\/\//i.test(String(raw))) {
        errors.push(
          `DATABASE_URL must start with postgres:// or postgresql://`,
        );
      }
    }
    if (key === "NODE_ENV" && isProd && String(raw) !== "production") {
      errors.push(
        `NODE_ENV must be "production" when deploying to prod (got "${raw}")`,
      );
    }
  }

  if (isProd) {
    for (const key of PROD_RECOMMENDED) {
      if (!env[key]) warnings.push(`${key} recommended for production`);
    }
  }

  return { errors, warnings, ok: errors.length === 0 };
}

function main() {
  const argv = process.argv.slice(2);
  const explicitProd = argv.includes("--prod");
  const explicitDev = argv.includes("--dev");
  const isProd = explicitProd || (!explicitDev && process.env.NODE_ENV === "production");

  const result = validateEnv(process.env, { isProd });
  for (const w of result.warnings) console.warn(`[env] WARN ${w}`);
  for (const e of result.errors) console.error(`[env] ERROR ${e}`);
  if (!result.ok) {
    console.error(
      `[env] FAIL (${result.errors.length} error${result.errors.length === 1 ? "" : "s"}). Fix env before deploy.`,
    );
    process.exit(1);
  }
  console.log(`[env] OK (${isProd ? "prod" : "dev"} profile)`);
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
