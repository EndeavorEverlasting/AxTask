#!/usr/bin/env node
/**
 * Local dev only: ensure .env has a real SESSION_SECRET (never print the value).
 * Replaces placeholder/missing/short values; leaves an existing strong secret unchanged.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
/** Absolute path override (used by tests only; normal runs use project .env). */
const envPath = process.env.AXTASK_LOCAL_ENV_FILE
  ? path.resolve(process.env.AXTASK_LOCAL_ENV_FILE)
  : path.join(projectRoot, ".env");

const PLACEHOLDER_SUBSTR = "replace-with";
const MIN_LEN = 32;

function needsNewSecret(value) {
  if (value == null) return true;
  const v = String(value).trim();
  if (!v) return true;
  if (v.toLowerCase().includes(PLACEHOLDER_SUBSTR)) return true;
  if (v.length < MIN_LEN) return true;
  return false;
}

function parseSessionSecretFromDotenv(text) {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const m = /^\s*SESSION_SECRET\s*=\s*(.*)$/i.exec(line);
    if (!m) continue;
    let val = m[1].trim();
    const quoted =
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"));
    if (quoted) {
      val = val.slice(1, -1);
    } else {
      const hash = val.indexOf("#");
      if (hash >= 0) val = val.slice(0, hash).trim();
    }
    return { rawLine: line, value: val };
  }
  return null;
}

function upsertSessionSecret(text, newSecret) {
  const lines = text.split(/\r?\n/);
  let found = false;
  const out = lines.map((line) => {
    if (/^\s*SESSION_SECRET\s*=/i.test(line)) {
      found = true;
      return `SESSION_SECRET=${newSecret}`;
    }
    return line;
  });
  if (!found) {
    const insertAt = out.length && out[out.length - 1] === "" ? out.length - 1 : out.length;
    out.splice(insertAt, 0, `SESSION_SECRET=${newSecret}`, "");
  }
  return out.join("\n");
}

function main() {
  if (!fs.existsSync(envPath)) {
    console.error(
      "[local:secrets-bootstrap] No .env file. Run npm run local:env-init (or copy .env.example to .env) first.",
    );
    process.exit(1);
  }

  const text = fs.readFileSync(envPath, "utf8");
  const parsed = parseSessionSecretFromDotenv(text);
  const current = parsed?.value ?? "";

  if (!needsNewSecret(current)) {
    console.log("[local:secrets-bootstrap] SESSION_SECRET already set; leaving .env unchanged.");
    process.exit(0);
  }

  const secret = randomBytes(48).toString("base64url");
  const next = upsertSessionSecret(text, secret);
  fs.writeFileSync(envPath, next, "utf8");
  console.log(
    "[local:secrets-bootstrap] Wrote a new SESSION_SECRET to .env (value not shown). Do not commit .env.",
  );
  process.exit(0);
}

main();
