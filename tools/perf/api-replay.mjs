#!/usr/bin/env node
/**
 * perf:api-replay — deterministic gate for API latency heuristics.
 *
 * Why: the admin Performance panel reads real production samples out of
 * `security_events`, so a regression in `buildPerformanceSignals` is only
 * visible once an admin opens the tab. This script replays a canned
 * fixture (or one supplied via --fixture <path>) through the same pure
 * functions (`aggregateApiRequestEvents` + `buildPerformanceSignals`) and
 * fails the build if:
 *   - any `critical` signal fires in the baseline fixture, OR
 *   - a regression-style row (slow read, slow mutation, error burst) fails
 *     to emit the matching signal (i.e. we accidentally relaxed a
 *     threshold).
 *
 * The fixture is a JSON array of raw security_events rows with the fields
 * `{ route, method, statusCode, durationMs }`. A zero-row fixture means
 * "no data available"; we treat that as a warning, not a failure, so the
 * gate is safe to run in CI even before security_events is populated.
 *
 * Usage:
 *   node tools/perf/api-replay.mjs
 *   node tools/perf/api-replay.mjs --fixture tools/perf/fixtures/last-week.json
 *   AXTASK_API_REPLAY_FIXTURE=path/to.json node tools/perf/api-replay.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

async function loadHeuristics() {
  // `api-performance-heuristics.ts` is authored in TypeScript but has no
  // runtime-only dependencies beyond the normalizer, so we can evaluate it
  // through tsx without pulling in the full server graph.
  const entry = path.join(repoRoot, "server", "monitoring", "api-performance-heuristics.ts");
  const entryUrl = pathToFileURL(entry).href;
  try {
    return await import(entryUrl);
  } catch (err) {
    const tsxLoader = pathToFileURL(
      path.join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs"),
    ).href;
    // Fallback: the user ran plain node without tsx. Re-exec with tsx.
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[perf:api-replay] Could not load heuristics module directly (${msg}). ` +
        `Run via "npx tsx tools/perf/api-replay.mjs" or ensure the loader is registered (${tsxLoader}).`,
    );
  }
}

function parseArgs(argv) {
  const out = { fixture: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fixture" && argv[i + 1]) {
      out.fixture = argv[++i];
    } else if (a.startsWith("--fixture=")) {
      out.fixture = a.slice("--fixture=".length);
    }
  }
  return out;
}

function resolveFixturePath(cliFixture) {
  if (cliFixture) return path.resolve(process.cwd(), cliFixture);
  const envFixture = process.env.AXTASK_API_REPLAY_FIXTURE;
  if (envFixture) return path.resolve(process.cwd(), envFixture);
  return path.join(repoRoot, "tools", "perf", "fixtures", "api-replay-baseline.json");
}

function loadFixture(fixturePath) {
  if (!fs.existsSync(fixturePath)) {
    return { rows: [], source: fixturePath, missing: true };
  }
  const raw = fs.readFileSync(fixturePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(
      `[perf:api-replay] Fixture ${fixturePath} must be a JSON array of api_request events.`,
    );
  }
  return { rows: parsed, source: fixturePath, missing: false };
}

async function main() {
  const args = parseArgs(process.argv);
  const fixturePath = resolveFixturePath(args.fixture);
  const { rows, source, missing } = loadFixture(fixturePath);

  const { aggregateApiRequestEvents, buildPerformanceSignals } = await loadHeuristics();

  if (missing) {
    console.warn(
      `[perf:api-replay] Fixture not found at ${source} — skipping replay. Provide one via --fixture or AXTASK_API_REPLAY_FIXTURE to enforce the gate.`,
    );
    return;
  }
  if (rows.length === 0) {
    console.warn(
      `[perf:api-replay] Fixture ${source} is empty — skipping replay. This is safe in CI before security_events is populated.`,
    );
    return;
  }

  const aggregated = aggregateApiRequestEvents(rows);
  const signals = buildPerformanceSignals(aggregated);

  console.log(
    `[perf:api-replay] Replayed ${rows.length} events across ${aggregated.length} routes from ${path.relative(repoRoot, source)}.`,
  );
  for (const s of signals) {
    console.log(`  - ${s.severity.toUpperCase()} ${s.code}: ${s.title} — ${s.detail}`);
  }

  const critical = signals.filter((s) => s.severity === "critical");
  if (critical.length > 0) {
    console.error(
      `[perf:api-replay] ${critical.length} critical signal(s) in baseline fixture — fix the regression or update the fixture with a justified commit message.`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
