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

/*
 * Ratcheted post-pass-3 (perf/pass-3-sprint). Measured values on
 * 2026-04-19 with a fresh production build:
 *   - Largest single chunk (main `index`): 422 KB
 *   - Total JS across all chunks:          2.49 MB
 * Defaults below keep ~2x headroom: normal growth is fine but silent
 * regressions (e.g. accidental static import of a heavy vendor into
 * the main chunk) trip the budget. Override via AXTASK_MAX_MAIN_CHUNK_BYTES
 * or AXTASK_MAX_TOTAL_JS_BYTES when landing a measured, intentional
 * increase.
 */
const DEFAULT_MAX_MAIN = 900_000;
const DEFAULT_MAX_TOTAL = 4_500_000;

/**
 * Per-vendor-chunk soft ceilings in bytes. These WARN only — they do not
 * fail the build. Set AXTASK_STRICT_CHUNKS=1 to promote to hard failures.
 *
 * All values tightened after pass-3 measurements to reflect current
 * reality plus ~20% headroom. Goal: a silent re-import of a heavy dep
 * into the wrong chunk trips a warning on the next CI run instead of
 * sliding in unnoticed. Bump a number here only after confirming the
 * growth is intentional.
 */
const SOFT_CHUNK_CEILINGS = {
  // Ratcheted 2026-04-20: production build ~236 KB after community polls + shared
  // markdown/SafeMarkdown paths (wouter/react-dom chunk). ~20% headroom over measured.
  "react-vendor": 280_000,
  "radix": 180_000, // measured 140 KB
  "tanstack": 80_000, // measured ~63 KB
  "recharts": 500_000, // measured 411 KB
  "framer-motion": 150_000, // measured 122 KB
  "spreadsheet": 400_000, // measured 352 KB
  "icons": 80_000, // measured 62 KB
  "date": 60_000, // measured 45 KB
  "dnd": 70_000, // measured 50 KB
  "embla": 80_000,
  "forms": 140_000, // measured 125 KB (old soft 80 KB was already violated)
  "billing-bridge": 300_000, // measured 261 KB
  "index": 500_000, // main entry; measured 422 KB
  // xyflow (React Flow) + lazy skill-tree graph chunk (dagre + route); measured ~2026-04-19
  "xyflow-vendor": 160_000,
  "skill-tree-graph": 80_000,
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
