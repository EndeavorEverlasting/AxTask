#!/usr/bin/env node
/**
 * Generate copy/paste-ready AxTask secret env vars.
 *
 * This intentionally writes to stdout only. Paste values directly into your
 * password manager and deployment host; never commit generated output.
 *
 * Usage:
 *   npm run env:secrets:generate
 *   npm run env:secrets:generate -- --required-only
 *   npm run env:secrets:generate -- --no-comments
 */
import { randomBytes } from "node:crypto";

function randomBase64Url(bytes) {
  return randomBytes(bytes).toString("base64url");
}

function randomHex(bytes) {
  return randomBytes(bytes).toString("hex");
}

const args = new Set(process.argv.slice(2));

if (args.has("--help") || args.has("-h")) {
  process.stdout.write(`AxTask env secret generator\n\nUsage:\n  npm run env:secrets:generate\n  npm run env:secrets:generate -- --required-only\n  npm run env:secrets:generate -- --no-comments\n\nOutput is stdout only. Store generated values in your password manager / host env.\n`);
  process.exit(0);
}

if (process.env.CI === "true" && !args.has("--allow-ci-output")) {
  process.stderr.write("Refusing to print secrets in CI. Re-run locally, or pass --allow-ci-output only for a secured one-off job.\n");
  process.exit(1);
}

const includeOptional = !args.has("--required-only");
const comments = !args.has("--no-comments");

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
  process.stdout.write("# Provider-issued secrets (DATABASE_URL, OAuth, Resend, S3, Redis) are not generated here.\n\n");
}

for (const group of groups) {
  if (group.optional && !includeOptional) continue;
  if (comments) process.stdout.write(`# ${group.title}\n`);
  for (const [key, value, note] of group.items) {
    if (comments) process.stdout.write(`# ${note}\n`);
    process.stdout.write(`${key}=${value}\n`);
  }
  process.stdout.write("\n");
}

if (comments) {
  process.stdout.write("# Generate VAPID separately with: npm run vapid:generate -- --subject mailto:you@example.com\n");
  process.stdout.write("# Then set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, and VITE_VAPID_PUBLIC_KEY together.\n");
}
