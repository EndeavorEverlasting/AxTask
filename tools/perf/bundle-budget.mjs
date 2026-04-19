#!/usr/bin/env node
/**
 * Fails if the production client bundle grows beyond configured ceilings.
 * Run after `npm run build` (expects dist/public/assets/*.js).
 *
 * After Phase A manualChunks the main bundle is split into named vendor
 * chunks. Per-chunk soft ceilings warn (do not fail) so the first run after
 * a split stays green; tighten them as you measure.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const assetsDir = path.join(repoRoot, "dist", "public", "assets");

const DEFAULT_MAX_MAIN = 3_500_000;
const DEFAULT_MAX_TOTAL = 8_000_000;

/**
 * Per-vendor-chunk soft ceilings in bytes. These WARN only — they do not
 * fail the build. Set AXTASK_STRICT_CHUNKS=1 to promote to hard failures.
 */
const SOFT_CHUNK_CEILINGS = {
  "react-vendor": 350_000,
  "radix": 500_000,
  "tanstack": 200_000,
  "recharts": 500_000,
  "framer-motion": 200_000,
  "spreadsheet": 1_200_000,
  "icons": 150_000,
  "date": 100_000,
  "dnd": 100_000,
  "embla": 80_000,
  "forms": 80_000,
};

function parseByteLimit(raw, envName, fallback) {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || Number.isNaN(n)) {
    console.warn(
      `[bundle-budget] Invalid ${envName}=${JSON.stringify(raw)} — using default ${fallback}`,
    );
    return fallback;
  }
  return n;
}

const MAX_LARGEST_CHUNK_BYTES = parseByteLimit(
  process.env.AXTASK_MAX_MAIN_CHUNK_BYTES,
  "AXTASK_MAX_MAIN_CHUNK_BYTES",
  DEFAULT_MAX_MAIN,
);
const MAX_TOTAL_JS_BYTES = parseByteLimit(
  process.env.AXTASK_MAX_TOTAL_JS_BYTES,
  "AXTASK_MAX_TOTAL_JS_BYTES",
  DEFAULT_MAX_TOTAL,
);
const STRICT_CHUNKS = process.env.AXTASK_STRICT_CHUNKS === "1";

function chunkBaseName(fileName) {
  // Vite names chunks like `react-vendor-abc123.js` or `index-abc123.js`.
  const stem = fileName.replace(/\.js$/, "");
  const dashIdx = stem.lastIndexOf("-");
  if (dashIdx < 0) return stem;
  const maybeHash = stem.slice(dashIdx + 1);
  // Consider it a hash if it's 6+ chars of [a-zA-Z0-9_]
  if (/^[a-zA-Z0-9_]{6,}$/.test(maybeHash)) return stem.slice(0, dashIdx);
  return stem;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function main() {
  if (!fs.existsSync(assetsDir)) {
    console.error(`[bundle-budget] Missing ${assetsDir} — run "npm run build" first.`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(assetsDir)
    .filter((f) => f.endsWith(".js"))
    .map((name) => {
      const p = path.join(assetsDir, name);
      const stat = fs.statSync(p);
      return { name, base: chunkBaseName(name), bytes: stat.size };
    })
    .sort((a, b) => b.bytes - a.bytes);

  if (files.length === 0) {
    console.error("[bundle-budget] No JS files in dist/public/assets.");
    process.exit(1);
  }

  const largest = files[0];
  const total = files.reduce((s, f) => s + f.bytes, 0);

  console.log(
    `[bundle-budget] JS chunks: ${files.length}, largest ${largest.name} ${formatBytes(largest.bytes)}, total ${formatBytes(total)}`,
  );

  // Per-chunk soft check
  const softWarnings = [];
  for (const file of files) {
    const ceiling = SOFT_CHUNK_CEILINGS[file.base];
    if (ceiling && file.bytes > ceiling) {
      softWarnings.push(
        `[bundle-budget] soft ceiling: ${file.base} is ${formatBytes(file.bytes)} (soft limit ${formatBytes(ceiling)})`,
      );
    }
  }
  for (const msg of softWarnings) {
    if (STRICT_CHUNKS) console.error(msg);
    else console.warn(msg);
  }

  if (largest.bytes > MAX_LARGEST_CHUNK_BYTES) {
    console.error(
      `[bundle-budget] Largest chunk ${largest.bytes} exceeds limit ${MAX_LARGEST_CHUNK_BYTES}. Set AXTASK_MAX_MAIN_CHUNK_BYTES to override intentionally.`,
    );
    process.exit(1);
  }
  if (total > MAX_TOTAL_JS_BYTES) {
    console.error(
      `[bundle-budget] Total JS ${total} exceeds limit ${MAX_TOTAL_JS_BYTES}. Set AXTASK_MAX_TOTAL_JS_BYTES to override intentionally.`,
    );
    process.exit(1);
  }

  if (STRICT_CHUNKS && softWarnings.length > 0) {
    console.error(
      `[bundle-budget] Strict mode: ${softWarnings.length} soft-ceiling violation(s).`,
    );
    process.exit(1);
  }
}

main();
