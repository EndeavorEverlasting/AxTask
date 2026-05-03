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
  "AUTH_AUDIT_PEPPER",
  "ARCHETYPE_ANALYTICS_SALT",
  "TOTP_ENCRYPTION_KEY",
  // NOTE: CANONICAL_HOST is "sync: false" in render.yaml but recommended
  // for production; we warn rather than hard-fail.
];

const PROD_RECOMMENDED = ["CANONICAL_HOST", "FORCE_HTTPS"];

// Minimum length for secret-ish values so obvious placeholders are caught.
const MIN_SECRET_LENGTH = 20;
const MIN_ARCHETYPE_SALT_LENGTH = 16;
const MIN_INVITE_CODE_LENGTH = 8;
const SECRET_KEYS = new Set([
  "SESSION_SECRET",
  "AUTH_AUDIT_PEPPER",
  "GOOGLE_CLIENT_SECRET",
  "WORKOS_API_KEY",
]);

const REG_MODES = new Set(["open", "invite", "closed"]);

/** Effective registration mode (matches server/registration-config.ts). */
function effectiveRegistrationMode(env) {
  const raw = String(env.REGISTRATION_MODE ?? "").trim();
  const token = raw.toLowerCase();
  if (token && REG_MODES.has(token)) return token;
  return String(env.NODE_ENV) === "production" ? "invite" : "open";
}

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
    if (key === "ARCHETYPE_ANALYTICS_SALT" && isProd) {
      if (String(raw).length < MIN_ARCHETYPE_SALT_LENGTH) {
        errors.push(
          `ARCHETYPE_ANALYTICS_SALT is too short (${String(raw).length} chars, need >= ${MIN_ARCHETYPE_SALT_LENGTH})`,
        );
      }
    }
    if (key === "TOTP_ENCRYPTION_KEY" && isProd) {
      const v = String(raw).trim();
      if (!/^[0-9a-fA-F]{64}$/.test(v)) {
        errors.push(
          "TOTP_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes)",
        );
      }
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

  const regRaw = String(env.REGISTRATION_MODE ?? "").trim();
  const regToken = regRaw.toLowerCase();
  if (regRaw && !REG_MODES.has(regToken)) {
    if (isProd) {
      errors.push(
        `REGISTRATION_MODE must be one of open, invite, closed (got "${regRaw}")`,
      );
    } else {
      warnings.push(
        `REGISTRATION_MODE unrecognized value "${regRaw}" — falling back to open in development`,
      );
    }
  }

  if (isProd && !ignore.has("INVITE_CODE")) {
    const mode = effectiveRegistrationMode(env);
    const invite = String(env.INVITE_CODE ?? "").trim();
    if (mode === "invite") {
      if (!invite) {
        errors.push(
          "INVITE_CODE is required when registration is invite-only (including the production default when REGISTRATION_MODE is unset)",
        );
      } else if (invite.length < MIN_INVITE_CODE_LENGTH) {
        errors.push(
          `INVITE_CODE must be at least ${MIN_INVITE_CODE_LENGTH} characters`,
        );
      }
    }
  }

  if (isProd) {
    const pub = String(env.VAPID_PUBLIC_KEY ?? "").trim();
    const pubVite = String(env.VITE_VAPID_PUBLIC_KEY ?? "").trim();
    const priv = String(env.VAPID_PRIVATE_KEY ?? "").trim();
    const anyVapid = Boolean(pub || pubVite || priv);
    if (anyVapid) {
      if (!pub && !ignore.has("VAPID_PUBLIC_KEY")) {
        errors.push("VAPID_PUBLIC_KEY is required when any web push key is set");
      }
      if (!priv && !ignore.has("VAPID_PRIVATE_KEY")) {
        errors.push("VAPID_PRIVATE_KEY is required when any web push key is set");
      }
      if (!pubVite && !ignore.has("VITE_VAPID_PUBLIC_KEY")) {
        errors.push(
          "VITE_VAPID_PUBLIC_KEY is required when any web push key is set (must match VAPID_PUBLIC_KEY at build time)",
        );
      }
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
