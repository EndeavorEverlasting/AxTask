#!/usr/bin/env node
/**
 * Generate a single lowercase hex secret to stdout (pipe-friendly).
 *
 * Default: 64 hex characters (32 bytes = 256 bits of entropy).
 *
 * Usage:
 *   npm run secret:hex
 *   npm run secret:hex -- --chars 64
 *   npm run secret:hex -- --bits 256
 *   npm run secret:hex -- --bits 64
 *   npm run secret:hex -- --help
 *
 * Output is stdout only. Never commit generated values.
 */
import { generateHexSecret, parseArgs } from "./generate-secret-core.mjs";

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function printUsage() {
  process.stdout.write(`AxTask hex secret generator

Usage:
  npm run secret:hex
  npm run secret:hex -- --chars 64
  npm run secret:hex -- --bits 256
  npm run secret:hex -- --bits 64

Default output is 64 lowercase hex characters (256 bits of entropy).
--bits 64 prints 16 hex characters (64 bits).

Output is stdout only. Paste into your password manager or Render env.
Do not commit generated values.
`);
}

function main() {
  const argv = process.argv.slice(2);
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  if (parsed.help) {
    printUsage();
    process.exit(0);
  }

  if (process.env.CI === "true" && !argv.includes("--allow-ci-output")) {
    fail("Refusing to print secrets in CI. Re-run locally, or pass --allow-ci-output only for a secured one-off job.");
  }

  try {
    const token = generateHexSecret({ chars: parsed.chars, bits: parsed.bits });
    process.stdout.write(`${token}\n`);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

main();
