#!/usr/bin/env node
/**
 * Cross-reference env keys across templates, Render manifest, docs, and source.
 * Never prints values — key names and presence only.
 *
 * Usage:
 *   node scripts/audit-env.mjs [--json] [--strict]
 *
 * --strict exits 1 if production contract keys are missing from templates or render.yaml.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/** Keys enforced by deploy/runtime but not always spelled as literal `process.env.*` reads in TS (see registration-config, check-env). */
const CODE_KEYS_EXTRA = new Set([
  "REGISTRATION_MODE",
  "INVITE_CODE",
  "AUTH_AUDIT_PEPPER",
]);

const ENV_FILES = [
  ".env",
  ".env.docker",
  ".env.example",
  ".env.docker.example",
  ".env.production.example",
  ".env.render.example",
  ".env.render",
];

const SCAN_DIRS = [
  { dir: "server", exts: [".ts"] },
  { dir: "scripts", exts: [".mjs", ".js", ".ts"] },
  { dir: "tools", exts: [".mjs", ".js", ".ts"] },
  { dir: "client", exts: [".ts", ".tsx"] },
];

/** Keys that must appear in BOTH prod templates AND render.yaml web contract (names only). */
export const STRICT_TEMPLATE_KEYS = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "NODE_ENV",
  "REGISTRATION_MODE",
  "INVITE_CODE",
  "AUTH_AUDIT_PEPPER",
  "ARCHETYPE_ANALYTICS_SALT",
  "TOTP_ENCRYPTION_KEY",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VITE_VAPID_PUBLIC_KEY",
];

function logErr(msg) {
  console.error(msg);
}

function parseArgs(argv) {
  return { json: argv.includes("--json"), strict: argv.includes("--strict") };
}

function readText(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/** Keys from .env-style files: active or commented # KEY= */
export function parseEnvFileKeys(text) {
  if (!text) return new Set();
  const keys = new Set();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

export function parseRenderYamlKeys(text) {
  if (!text) return new Set();
  const keys = new Set();
  const re = /^\s*-\s*key:\s*([A-Za-z0-9_]+)\s*$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

function parseDocsCatalogKeys(text) {
  if (!text) return new Set();
  const keys = new Set();
  const re = /`([A-Z][A-Z0-9_]*)`/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

const PROCESS_ENV_RE = /process\.env\.([A-Z_][A-Z0-9_]*)\b/g;
const IMPORT_META_ENV_RE = /import\.meta\.env\.([A-Z_][A-Z0-9_]*)\b/g;

function shouldSkipPath(p) {
  const n = p.replace(/\\/g, "/");
  return (
    n.includes("/node_modules/") ||
    n.includes("/dist/") ||
    n.endsWith(".test.ts") ||
    n.endsWith(".test.tsx") ||
    n.includes("/__snapshots__/")
  );
}

function* walkFiles(rootDir, exts) {
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === "dist") continue;
        stack.push(full);
      } else if (exts.some((e) => ent.name.endsWith(e))) {
        if (!shouldSkipPath(full)) yield full;
      }
    }
  }
}

function collectCodeKeys() {
  const keys = new Set();
  for (const { dir, exts } of SCAN_DIRS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of walkFiles(abs, exts)) {
      const text = readText(file);
      if (!text) continue;
      let m;
      while ((m = PROCESS_ENV_RE.exec(text)) !== null) keys.add(m[1]);
      while ((m = IMPORT_META_ENV_RE.exec(text)) !== null) keys.add(m[1]);
    }
  }
  return keys;
}

function unionSets(sets) {
  const u = new Set();
  for (const s of sets) for (const k of s) u.add(k);
  return u;
}

export function runAudit({ json = false, strict = false } = {}) {
  const templateProd = parseEnvFileKeys(readText(path.join(ROOT, ".env.production.example")));
  const templateRender = parseEnvFileKeys(readText(path.join(ROOT, ".env.render.example")));
  const renderYaml = parseRenderYamlKeys(readText(path.join(ROOT, "render.yaml")));
  const docsPath = path.join(ROOT, "docs", "ENVIRONMENT_VARIABLES.md");
  const docsKeys = parseDocsCatalogKeys(readText(docsPath));
  const codeKeys = new Set([...collectCodeKeys(), ...CODE_KEYS_EXTRA]);

  const envColKeys = {};
  for (const name of ENV_FILES) {
    const p = path.join(ROOT, name);
    envColKeys[name] = fs.existsSync(p) ? parseEnvFileKeys(readText(p)) : new Set();
  }

  const allKeys = new Set([
    ...codeKeys,
    ...docsKeys,
    ...templateProd,
    ...templateRender,
    ...renderYaml,
    ...unionSets(Object.values(envColKeys)),
  ]);

  const templateUnion = new Set([...templateProd, ...templateRender]);
  const codeNotInTemplate = [...codeKeys].filter((k) => !templateUnion.has(k)).sort();
  const templateOrphan = [...templateUnion].filter((k) => !codeKeys.has(k)).sort();
  const docsOnly = [...docsKeys].filter((k) => !codeKeys.has(k) && !templateUnion.has(k)).sort();
  const prodMinusRender = [...templateProd].filter((k) => !templateRender.has(k)).sort();
  const renderMinusProd = [...templateRender].filter((k) => !templateProd.has(k)).sort();

  const strictGaps = [];
  if (strict) {
    for (const key of STRICT_TEMPLATE_KEYS) {
      if (!templateProd.has(key)) strictGaps.push({ key, reason: "missing from .env.production.example" });
      if (!templateRender.has(key)) strictGaps.push({ key, reason: "missing from .env.render.example" });
      if (!renderYaml.has(key)) strictGaps.push({ key, reason: "missing from render.yaml envVars" });
    }
  }

  const row = (k) => ({
    key: k,
    code: codeKeys.has(k),
    docs: docsKeys.has(k),
    env_example: envColKeys[".env.example"]?.has(k) ?? false,
    env_docker_example: envColKeys[".env.docker.example"]?.has(k) ?? false,
    prod_example: templateProd.has(k),
    render_example: templateRender.has(k),
    render_yaml: renderYaml.has(k),
  });

  const matrix = [...allKeys].sort().map(row);

  const out = {
    summary: {
      keyCount: allKeys.size,
      codeRefs: codeKeys.size,
      strictGaps: strictGaps.length,
      codeKeysExtra: CODE_KEYS_EXTRA.size,
    },
    categories: {
      codeNotInEitherTemplate: codeNotInTemplate,
      inTemplateButNotInCode: templateOrphan,
      docsOnlyNoCodeNoTemplate: docsOnly,
      prodExampleMinusRenderExample: prodMinusRender,
      renderExampleMinusProdExample: renderMinusProd,
    },
    strictFailures: strictGaps,
    matrix,
  };

  if (json) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log("AxTask env surface audit (key names only)\n");
    console.log(
      `Keys: ${out.summary.keyCount} total | ${out.summary.codeRefs} from source scan + deploy contract extras`,
    );
    console.log("");
    for (const [label, arr] of Object.entries(out.categories)) {
      if (!arr.length) continue;
      console.log(`${label} (${arr.length}):`);
      for (const k of arr) console.log(`  - ${k}`);
      console.log("");
    }
    if (strictGaps.length) {
      logErr(`Strict mode: ${strictGaps.length} contract gap(s):`);
      for (const g of strictGaps) logErr(`  - ${g.key}: ${g.reason}`);
    }
  }

  return { ok: strictGaps.length === 0, ...out };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { ok } = runAudit(opts);
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
