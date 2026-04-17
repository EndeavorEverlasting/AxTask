#!/usr/bin/env node
/**
 * Fails if the production client bundle grows beyond configured ceilings.
 * Run after `npm run build` (expects dist/public/assets/*.js).
 *
 * Tuned against current main chunk ~2.3MB raw / ~664KB gzip — leave headroom for growth;
 * tighten when you split vendor chunks.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const assetsDir = path.join(repoRoot, "dist", "public", "assets");

/** Largest single JS chunk (main bundle is currently monolithic). */
const MAX_LARGEST_CHUNK_BYTES = Number(process.env.AXTASK_MAX_MAIN_CHUNK_BYTES || 3_500_000);
/** Sum of all emitted JS under assets (guards accidental duplicate heavy deps). */
const MAX_TOTAL_JS_BYTES = Number(process.env.AXTASK_MAX_TOTAL_JS_BYTES || 8_000_000);

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
      return { name, bytes: stat.size };
    })
    .sort((a, b) => b.bytes - a.bytes);

  if (files.length === 0) {
    console.error("[bundle-budget] No JS files in dist/public/assets.");
    process.exit(1);
  }

  const largest = files[0];
  const total = files.reduce((s, f) => s + f.bytes, 0);

  console.log(
    `[bundle-budget] JS chunks: ${files.length}, largest ${largest.name} ${largest.bytes} bytes, total ${total} bytes`,
  );

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
}

main();
