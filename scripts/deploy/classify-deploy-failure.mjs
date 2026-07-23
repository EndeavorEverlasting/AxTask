/**
 * Classifies a deploy log into a single failure bucket.
 *
 * Usage:
 *   cat deploy-log.txt | node scripts/deploy/classify-deploy-failure.mjs
 *   node scripts/deploy/classify-deploy-failure.mjs path/to/log.txt
 *
 * Outputs one line: the bucket name. Exit code 0 always (this is a triage
 * tool, not a gate).
 *
 * Buckets:
 *   DB_CAPACITY_EXCEEDED_DURING_MIGRATION
 *   MIGRATION_FAILED
 *   DB_UNREACHABLE
 *   ENV_MISSING
 *   BUILD_FAILED
 *   ARTIFACT_MISSING
 *   STARTUP_TTY_INTERACTIVE_PROMPT
 *   RUNTIME_OOM
 *   STARTUP_FAILED
 *   HEALTHCHECK_FAILED
 *   SMOKE_FAILED
 *   UNKNOWN
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Order matters: more specific patterns first. The Neon/Postgres capacity
 * pattern is checked before generic migration failure, and dedicated runtime
 * signatures are checked before generic startup/health buckets.
 */
export const CLASSIFIERS = [
  {
    bucket: "DB_CAPACITY_EXCEEDED_DURING_MIGRATION",
    patterns: [
      /project size limit.*exceeded/i,
      /neon\.max_cluster_size/i,
      /could not extend file.*No space left/i,
      /errno?\s*53100/i,
      // Pair with apply-migrations.mjs call site to be confident it was during migration
    ],
    confirm: [/apply-migrations\.mjs/i],
  },
  {
    bucket: "MIGRATION_FAILED",
    patterns: [
      /apply-migrations\.mjs.*error/i,
      /\[migrate\]\s*\u2717/,
      /drizzle-kit.*push.*fail/i,
      /migration failed/i,
    ],
  },
  {
    bucket: "DB_UNREACHABLE",
    patterns: [
      /ECONNREFUSED.*5432/,
      /ENOTFOUND.*postgres/i,
      /connection\s+terminated/i,
      /password authentication failed/i,
    ],
  },
  {
    bucket: "ENV_MISSING",
    patterns: [
      /DATABASE_URL\s+is\s+not\s+set/i,
      /SESSION_SECRET\s+(is\s+)?missing/i,
      /required environment variable/i,
    ],
  },
  {
    bucket: "BUILD_FAILED",
    patterns: [
      /vite build.*fail/i,
      /esbuild.*error/i,
      /tsc.*error TS\d+/,
      /Error: Build failed/i,
    ],
  },
  {
    bucket: "ARTIFACT_MISSING",
    patterns: [
      /dist\/index\.js not found/i,
      /Missing .*dist\/public\/assets/i,
      /build-manifest.json.*missing/i,
    ],
  },
  {
    bucket: "STARTUP_TTY_INTERACTIVE_PROMPT",
    patterns: [
      /Interactive prompts require a TTY terminal/i,
      /stdin is not a TTY/i,
    ],
    // Avoid classifying unrelated terminal warnings as schema-startup failure.
    confirm: [/drizzle-kit[\s\S]{0,200}push|Drizzle schema sync/i],
  },
  {
    bucket: "RUNTIME_OOM",
    patterns: [
      /FATAL ERROR:\s*Ineffective mark-compacts near heap limit/i,
      /Allocation failed - JavaScript heap out of memory/i,
      /Reached heap limit Allocation failed/i,
    ],
  },
  {
    bucket: "STARTUP_FAILED",
    patterns: [
      /\[production-start\].*fatal/i,
      /Address already in use.*:5000/i,
      /EADDRINUSE/,
      /uncaughtException.*at startup/i,
    ],
  },
  {
    bucket: "HEALTHCHECK_FAILED",
    patterns: [
      /health check (failed|timed out)/i,
      /\/ready.*503/,
      /Render.*health/i,
    ],
  },
  {
    bucket: "SMOKE_FAILED",
    patterns: [
      /smoke.*test.*fail/i,
      /\[smoke\]\s*\u2717/,
    ],
  },
];

export function classifyLog(text) {
  if (!text || typeof text !== "string") return "UNKNOWN";
  for (const c of CLASSIFIERS) {
    const hit = c.patterns.some((re) => re.test(text));
    if (!hit) continue;
    if (c.confirm && !c.confirm.every((re) => re.test(text))) continue;
    return c.bucket;
  }
  return "UNKNOWN";
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      buf += chunk;
    });
    process.stdin.on("end", () => resolve(buf));
    process.stdin.on("error", reject);
    // If nothing is piped and we're in a TTY, resolve empty so the CLI can
    // fall through to argv file read.
    if (process.stdin.isTTY) resolve("");
  });
}

async function main() {
  const fileArg = process.argv[2];
  let text = "";
  if (fileArg) {
    text = fs.readFileSync(fileArg, "utf8");
  } else {
    text = await readStdin();
  }
  const bucket = classifyLog(text);
  console.log(bucket);
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
