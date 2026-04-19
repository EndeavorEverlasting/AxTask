/**
 * Emits dist/build-manifest.json after `npm run build`.
 *
 * Captures chunk sizes, entry points, and a SHA-256 hash of dist/index.js
 * so regression tests (tests/deploy/08-regression) can detect unintended
 * bundle growth or missing artifacts across deploys.
 *
 * Usage:  node scripts/deploy/build-manifest.mjs [--out=dist/build-manifest.json]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function hashFile(filepath) {
  const buf = fs.readFileSync(filepath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function stemName(filename) {
  const stem = filename.replace(/\.js$/, "");
  const dashIdx = stem.lastIndexOf("-");
  if (dashIdx < 0) return stem;
  const maybeHash = stem.slice(dashIdx + 1);
  if (/^[a-zA-Z0-9_]{6,}$/.test(maybeHash)) return stem.slice(0, dashIdx);
  return stem;
}

export function buildManifest(root = repoRoot) {
  const distDir = path.join(root, "dist");
  const publicDir = path.join(distDir, "public");
  const assetsDir = path.join(publicDir, "assets");
  const serverEntry = path.join(distDir, "index.js");

  if (!fs.existsSync(distDir)) {
    throw new Error(`dist/ missing; run "npm run build" first.`);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    serverEntry: {
      path: "dist/index.js",
      exists: fs.existsSync(serverEntry),
      bytes: fs.existsSync(serverEntry) ? fs.statSync(serverEntry).size : 0,
      sha256: fs.existsSync(serverEntry) ? hashFile(serverEntry) : null,
    },
    clientAssets: [],
    totals: { js: 0, css: 0, other: 0 },
  };

  if (fs.existsSync(assetsDir)) {
    const entries = fs.readdirSync(assetsDir);
    for (const name of entries) {
      const full = path.join(assetsDir, name);
      const stat = fs.statSync(full);
      const ext = path.extname(name).toLowerCase();
      const bucket = ext === ".js" ? "js" : ext === ".css" ? "css" : "other";
      manifest.totals[bucket] += stat.size;
      manifest.clientAssets.push({
        file: name,
        chunk: stemName(name),
        ext,
        bytes: stat.size,
      });
    }
    manifest.clientAssets.sort((a, b) => b.bytes - a.bytes);
  }

  return manifest;
}

function parseOutArg() {
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--out=")) return a.slice("--out=".length);
  }
  return "dist/build-manifest.json";
}

function main() {
  const manifest = buildManifest();
  const outRel = parseOutArg();
  const outAbs = path.resolve(repoRoot, outRel);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, JSON.stringify(manifest, null, 2));
  console.log(
    `[build-manifest] wrote ${outRel} (${manifest.clientAssets.length} assets, server ${manifest.serverEntry.bytes} bytes)`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
