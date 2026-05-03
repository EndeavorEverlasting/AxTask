#!/usr/bin/env node
/**
 * Generate copy/paste-ready AxTask secret env vars.
 *
 * This intentionally writes to stdout only. Paste values directly into your
 * password manager and deployment host; never commit generated output.
 *
 * Idempotent by default: keys that already have a non-empty value in the
 * target env file are skipped, so appending output never creates duplicate
 * entries with different values. Pass --overwrite to force regeneration.
 *
 * Usage:
 *   npm run env:secrets:generate
 *   npm run env:secrets:generate -- --required-only
 *   npm run env:secrets:generate -- --no-comments
 *   npm run env:secrets:generate -- --overwrite
 *   npm run env:secrets:generate -- --env-file path/to/file.env
 *   npm run env:secrets:generate -- --no-skip-existing
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function randomBase64Url(bytes) {
  return randomBytes(bytes).toString("base64url");
}

function randomHex(bytes) {
  return randomBytes(bytes).toString("hex");
}

const argv = process.argv.slice(2);
const args = new Set(argv);

function flagValue(name) {
  const idx = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (idx === -1) return undefined;
  const eq = argv[idx].indexOf("=");
  if (eq !== -1) return argv[idx].slice(eq + 1);
  return argv[idx + 1];
}

if (args.has("--help") || args.has("-h")) {
  process.stdout.write(`AxTask env secret generator\n\nUsage:\n  npm run env:secrets:generate\n  npm run env:secrets:generate -- --required-only\n  npm run env:secrets:generate -- --no-comments\n  npm run env:secrets:generate -- --overwrite\n  npm run env:secrets:generate -- --env-file path/to/.env\n  npm run env:secrets:generate -- --no-skip-existing\n\nBy default, keys already set with a non-empty value in .env (at the repo root)\nare skipped so appending output never produces duplicate entries.\n\nOutput is stdout only. Store generated values in your password manager / host env.\n`);
  process.exit(0);
}

if (process.env.CI === "true" && !args.has("--allow-ci-output")) {
  process.stderr.write("Refusing to print secrets in CI. Re-run locally, or pass --allow-ci-output only for a secured one-off job.\n");
  process.exit(1);
}

const includeOptional = !args.has("--required-only");
const comments = !args.has("--no-comments");
const overwrite = args.has("--overwrite");
const skipExisting = !args.has("--no-skip-existing") && !overwrite;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFilePath = path.resolve(repoRoot, flagValue("env-file") ?? ".env");

function loadExistingEnv(filePath) {
  if (!skipExisting) return new Map();
  if (!fs.existsSync(filePath)) return new Map();
  const map = new Map();
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value.length === 0) continue;
    if (!map.has(key)) map.set(key, value);
  }
  return map;
}

const existingEnv = loadExistingEnv(envFilePath);

const groups = [
  {
    title: "Required stable production secrets",
    items: [
      ["SESSION_SECRET", randomBase64Url(48), "session signing; rotating logs users out"],
      ["AUTH_AUDIT_PEPPER", randomBase64Url(32), "audit/security hash pepper"],
      ["TOTP_ENCRYPTION_KEY", randomHex(32), "64 hex chars; protects authenticator secrets"],
      ["ARCHETYPE_ANALYTICS_SALT", randomHex(32), "privacy salt; rotating breaks continuity"],
    ],
  },
  {
    title: "Feature secrets to store if the feature is enabled",
    optional: true,
    items: [
      ["BACKUP_ENCRYPTION_KEY", randomHex(32), "64 hex chars; required to decrypt encrypted backups"],
      ["ARCHETYPE_READ_TOKEN", randomBase64Url(32), "optional token for non-session analytics readers"],
      ["AXTASK_ALARM_COMPANION_SECRET", randomBase64Url(32), "alarm companion shared secret"],
      ["ATTACHMENT_UPLOAD_SECRET", randomBase64Url(32), "optional separate upload signing secret"],
      ["INVITE_CODE", randomBase64Url(18), "only needed when REGISTRATION_MODE=invite"],
    ],
  },
];

if (comments) {
  process.stdout.write("# AxTask generated secrets\n");
  process.stdout.write("# Store these in your password manager and deployment environment.\n");
  process.stdout.write("# Do not commit this output. Do not generate fresh production values on every boot.\n");
  process.stdout.write("# Provider-issued secrets (DATABASE_URL, OAuth, Resend, S3, Redis) are not generated here.\n");
  if (skipExisting && existingEnv.size > 0) {
    process.stdout.write(`# Idempotent mode: skipping keys already set in ${path.relative(repoRoot, envFilePath) || envFilePath}. Pass --overwrite to force regeneration.\n`);
  }
  process.stdout.write("\n");
}

const skipped = [];
const emitted = [];

for (const group of groups) {
  if (group.optional && !includeOptional) continue;
  const groupItems = group.items.filter(([key]) => !(skipExisting && existingEnv.has(key)));
  for (const [key] of group.items) {
    if (skipExisting && existingEnv.has(key)) skipped.push(key);
  }
  if (groupItems.length === 0) continue;
  if (comments) process.stdout.write(`# ${group.title}\n`);
  for (const [key, value, note] of groupItems) {
    if (comments) process.stdout.write(`# ${note}\n`);
    process.stdout.write(`${key}=${value}\n`);
    emitted.push(key);
  }
  process.stdout.write("\n");
}

if (comments) {
  process.stdout.write("# Generate VAPID separately with: npm run vapid:generate -- --subject mailto:you@example.com\n");
  process.stdout.write("# Then set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, and VITE_VAPID_PUBLIC_KEY together.\n");
}

if (skipExisting && skipped.length > 0) {
  process.stderr.write(`[generate-env-secrets] Skipped ${skipped.length} key(s) already set in ${path.relative(repoRoot, envFilePath) || envFilePath}: ${skipped.join(", ")}\n`);
  process.stderr.write("[generate-env-secrets] Pass --overwrite to regenerate, or --no-skip-existing to print all keys.\n");
}
if (emitted.length === 0 && skipExisting) {
  process.stderr.write("[generate-env-secrets] No new secrets to generate; existing env file already has every supported key.\n");
}
