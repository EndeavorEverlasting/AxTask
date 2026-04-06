#!/usr/bin/env node
/**
 * Generate machine-safe secrets and a guided .env.render from .env.render.example.
 *
 * Privacy: never echoes SESSION_SECRET / INVITE_CODE to the terminal. Operational
 * messages and the paste guide go to stderr so stdout can be redirected safely, e.g.
 *   npm run render:env-bootstrap -- --stdout --domain=example.com > .env.render
 * Refuses --stdout when stdout is a TTY (avoids shell history / screen leaks).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import tty from "tty";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const EXAMPLE = path.join(projectRoot, ".env.render.example");
const OUT_DEFAULT = path.join(projectRoot, ".env.render");

const PLACEHOLDER_HOST = "your-domain.com";

function parseArgs(argv) {
  const out = {
    domain: null,
    outPath: OUT_DEFAULT,
    stdout: false,
    dryRun: false,
    force: false,
    invite: false,
    refreshSecretsOnly: false,
    allowStdoutTty: false,
    help: false,
  };
  for (const a of argv) {
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--stdout") out.stdout = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--force" || a === "-y") out.force = true;
    else if (a === "--invite") out.invite = true;
    else if (a === "--refresh-secrets-only") out.refreshSecretsOnly = true;
    else if (a === "--allow-stdout-tty") out.allowStdoutTty = true;
    else if (a.startsWith("--domain=") || a.startsWith("--host="))
      out.domain = a.split("=", 2)[1]?.trim() || null;
    else if (a.startsWith("--out=")) out.outPath = path.resolve(projectRoot, a.slice(6).trim());
  }
  return out;
}

function logInfo(msg) {
  console.error(msg);
}

function refuseStdoutIfTty(opts) {
  if (!opts.stdout || opts.allowStdoutTty) return;
  if (tty.isatty(1)) {
    logInfo(
      "[render:env-bootstrap] Refusing --stdout: your shell stdout is a terminal (secrets would appear in scrollback).",
    );
    logInfo(
      "  Redirect to a file:  ... --stdout --domain=YOUR_HOST > .env.render",
    );
    logInfo(
      "  Or omit --stdout to write the default gitignored .env.render",
    );
    logInfo(
      "  Last resort only:     ... --stdout --allow-stdout-tty",
    );
    process.exit(1);
  }
}

function usage() {
  logInfo(`Usage: node tools/render/render-env-bootstrap.mjs [options]

Writes a gitignored .env.render (from .env.render.example) with:
  • SESSION_SECRET (cryptographically random, ≥32 chars)
  • Optional: CANONICAL_HOST / BASE_URL / redirect hints from --domain

Secrets are never printed to the terminal; paste guidance is printed to stderr.

Options:
  --domain=HOST     Canonical hostname only, e.g. axtask.app (no https://)
  --host=HOST       Same as --domain
  --out=PATH        Output file (default: .env.render in repo root)
  --stdout          Write env file bytes to stdout only (refused if stdout is a TTY)
  --allow-stdout-tty  Allow --stdout even when stdout is a terminal (not recommended)
  --dry-run         Show actions only; no write
  --force, -y       Overwrite output without prompting
  --invite          Set REGISTRATION_MODE=invite and a random INVITE_CODE
  --refresh-secrets-only   Only update SESSION_SECRET (and INVITE_CODE if present) in existing .env.render
  --help, -h        This message

Examples:
  npm run render:env-bootstrap -- --domain=axtask.app --invite
  npm run render:env-bootstrap -- --refresh-secrets-only --force
`);
}

function normalizeDomain(raw) {
  if (raw == null) return null;
  let d = String(raw).trim();
  if (!d) return null;
  d = d.replace(/^https?:\/\//i, "");
  d = d.split("/")[0].trim();
  return d || null;
}

function newSessionSecret() {
  return randomBytes(48).toString("base64url");
}

function newInviteCode() {
  return randomBytes(16).toString("hex");
}

function replaceLine(lines, keyRe, newLine) {
  let found = false;
  const out = lines.map((line) => {
    if (keyRe.test(line)) {
      found = true;
      return newLine;
    }
    return line;
  });
  if (!found) out.push(newLine);
  return out;
}

function applyInviteBlock(text) {
  const code = newInviteCode();
  let lines = text.split(/\r?\n/);
  lines = lines.map((line) => {
    if (/^\s*#\s*REGISTRATION_MODE=invite\s*$/.test(line)) return "REGISTRATION_MODE=invite";
    if (/^\s*#\s*INVITE_CODE=/.test(line)) return `INVITE_CODE=${code}`;
    return line;
  });
  const hasInvite = lines.some((l) => /^\s*INVITE_CODE=/.test(l));
  if (!hasInvite) {
    const idx = lines.findIndex((l) => /^\s*REGISTRATION_MODE=invite\s*$/.test(l));
    const insertAt = idx >= 0 ? idx + 1 : lines.length;
    lines.splice(insertAt, 0, `INVITE_CODE=${code}`);
  }
  return lines.join("\n");
}

function refreshSecretsInFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error("[render:env-bootstrap] No file at", filePath, "— run without --refresh-secrets-only first.");
    process.exit(1);
  }
  let text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  let next = replaceLine(lines, /^\s*SESSION_SECRET\s*=/, `SESSION_SECRET=${newSessionSecret()}`);
  const joined = next.join("\n");
  const hasInvite = /^\s*INVITE_CODE=/m.test(joined);
  const outText = hasInvite
    ? replaceLine(next, /^\s*INVITE_CODE\s*=/, `INVITE_CODE=${newInviteCode()}`).join("\n")
    : joined;
  return outText;
}

function printPasteGuide(domain) {
  const host = domain || PLACEHOLDER_HOST;
  const base = `https://${host}`;
  const lines = [
    "",
    "========== Next: paste from dashboards (variable → source) ==========",
    "",
    `DATABASE_URL       → Render Dashboard → your Postgres → Connect → Internal Database URL`,
    `                   → or Neon / other host: full connection string (?sslmode=require)`,
    "",
    `GOOGLE_CLIENT_ID   → Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID`,
    `GOOGLE_CLIENT_SECRET → same OAuth client → Client secret`,
    `Google redirect    → Authorized redirect URIs must include:`,
    `                     ${base}/api/auth/google/callback`,
    "",
    `WORKOS_API_KEY     → WorkOS Dashboard → API Keys`,
    `WORKOS_CLIENT_ID   → WorkOS → Applications → Client ID`,
    `WORKOS_REDIRECT_URI (if you set it in env) should be:`,
    `                     ${base}/api/auth/workos/callback`,
    "",
    `REPL_ID            → Replit → your Repl → cover / metadata (if using Replit auth)`,
    `ISSUER_URL         → default https://replit.com/oidc unless Replit docs say otherwise`,
    "",
    `RESEND_API_KEY     → Resend → API Keys`,
    `RESEND_FROM        → verified sender, e.g. noreply@${host}`,
    "",
    `Optional: TWILIO_* from Twilio Console; VITE_* from your push / cache-bust needs.`,
    "",
    "---------- Render Web Service — where to click (sidebar) ----------",
    `Manage → Environment  = paste env vars (DATABASE_URL, SESSION_SECRET, …).`,
    `Events → Settings      = Health Check Path /ready (NOT on Environment page).`,
    `On Environment page: do NOT Ctrl+F "dashboard" (0 matches). Open Settings, then Ctrl+F "health".`,
    `Full steps: docs/RENDER_WEB_SERVICE_PASTE_CHECKLIST.md`,
    "",
    "======================================================================",
    "",
  ];
  logInfo(lines.join("\n"));
}

async function confirmOverwrite(outPath, force) {
  if (force) return true;
  if (!fs.existsSync(outPath)) return true;
  const rl = readline.createInterface({ input, output });
  try {
    const ans = await rl.question(
      `[render:env-bootstrap] ${outPath} exists. Overwrite? [y/N] `,
    );
    return /^y(es)?$/i.test(String(ans).trim());
  } finally {
    await rl.close();
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    process.exit(0);
  }

  refuseStdoutIfTty(opts);

  if (opts.refreshSecretsOnly) {
    const target = opts.stdout ? null : opts.outPath;
    const next = refreshSecretsInFile(target ?? opts.outPath);
    if (opts.dryRun) {
      logInfo("[render:env-bootstrap] dry-run: would refresh secrets in " + opts.outPath);
      process.exit(0);
    }
    if (opts.stdout) {
      process.stdout.write(next + (next.endsWith("\n") ? "" : "\n"));
    } else {
      if (!(await confirmOverwrite(opts.outPath, opts.force))) {
        logInfo("[render:env-bootstrap] Aborted.");
        process.exit(1);
      }
      fs.writeFileSync(opts.outPath, next.replace(/\r?\n/g, "\n"), "utf8");
      logInfo(
        "[render:env-bootstrap] Refreshed SESSION_SECRET" +
          (/\nINVITE_CODE=/m.test(next) ? " and INVITE_CODE" : "") +
          " in " +
          opts.outPath,
      );
    }
    printPasteGuide(normalizeDomain(opts.domain));
    process.exit(0);
  }

  if (!fs.existsSync(EXAMPLE)) {
    console.error("[render:env-bootstrap] Missing", EXAMPLE);
    process.exit(1);
  }

  let domain = normalizeDomain(opts.domain);
  if (!domain && !opts.stdout && process.stdin.isTTY) {
    const rl = readline.createInterface({ input, output });
    try {
      const raw = await rl.question(
        `[render:env-bootstrap] Canonical host (no https), e.g. axtask.app [Enter to keep ${PLACEHOLDER_HOST}]: `,
      );
      domain = normalizeDomain(raw);
    } finally {
      await rl.close();
    }
  }

  let text = fs.readFileSync(EXAMPLE, "utf8");
  text = text.replace(/\r\n/g, "\n");

  const banner = `# -----------------------------------------------------------------------------\n# Generated by tools/render/render-env-bootstrap.mjs — ${new Date().toISOString().slice(0, 10)}\n# Regenerate secrets only: npm run render:env-bootstrap -- --refresh-secrets-only --force\n# -----------------------------------------------------------------------------\n\n`;

  if (domain) {
    text = text.split(PLACEHOLDER_HOST).join(domain);
  }

  text = text.replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${newSessionSecret()}`);

  if (opts.invite) {
    text = applyInviteBlock(text);
  }

  const finalBody = banner + text;

  if (opts.dryRun) {
    logInfo("[render:env-bootstrap] dry-run: would write " + opts.outPath + " and print paste guide (stderr)");
    printPasteGuide(domain);
    process.exit(0);
  }

  if (opts.stdout) {
    process.stdout.write(finalBody + (finalBody.endsWith("\n") ? "" : "\n"));
    printPasteGuide(domain);
    process.exit(0);
  }

  if (!(await confirmOverwrite(opts.outPath, opts.force))) {
    logInfo("[render:env-bootstrap] Aborted.");
    process.exit(1);
  }

  fs.writeFileSync(opts.outPath, finalBody.replace(/\r?\n/g, "\n"), "utf8");
  logInfo("[render:env-bootstrap] Wrote " + opts.outPath);
  logInfo(
    "[render:env-bootstrap] In Render, set DATABASE_URL to your real Postgres connection string. If you paste the template value (…@HOST/…), the app will crash with ENOTFOUND HOST.",
  );
  logInfo(
    "[render:env-bootstrap] Before running bootstrap again for another domain (e.g. dev), copy " +
      opts.outPath +
      " aside — the next run overwrites this file (including SESSION_SECRET).",
  );
  logInfo(
    "[render:env-bootstrap] Lost in Render? Env vars = sidebar Manage → Environment. Health /ready = Events → Settings (not Environment).",
  );
  printPasteGuide(domain);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
