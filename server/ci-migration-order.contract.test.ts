import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CI migration-order contract.
 *
 * Guards the `postgres-schema-check` job in
 * `.github/workflows/test-and-attest.yml` from regressing to the greenfield-
 * broken order `apply-migrations.mjs -> drizzle-kit push`.
 *
 * The first hand-written SQL migration, `migrations/0001_youtube_probe_tables.sql`,
 * FK-references `users("id")`. On CI's fresh Postgres service container, `users`
 * only comes into being when Drizzle pushes. If someone ever reshuffles the
 * step back to running the SQL replay first, every PR immediately inherits a
 * `FAILURE` in this job — as happened before this fix.
 *
 * Production's start paths legitimately run `apply-migrations.mjs` first
 * because their DBs have had `users` since long before `0001` was written;
 * this contract does NOT constrain production bootstrap ordering.
 */

const REPO_ROOT = join(__dirname, "..");
const WORKFLOW_PATH = ".github/workflows/test-and-attest.yml";

function readWorkflow(): string {
  return readFileSync(join(REPO_ROOT, WORKFLOW_PATH), "utf8");
}

/**
 * Extract the block of text for a given top-level job in the workflow YAML.
 * We parse by text rather than YAML to keep this test dependency-free.
 */
function extractJobBlock(workflow: string, jobName: string): string {
  const lines = workflow.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => l.match(/^ {2}[\w-]+:\s*$/) && l.trim() === `${jobName}:`);
  if (startIdx === -1) {
    throw new Error(`Job "${jobName}" not found in ${WORKFLOW_PATH}`);
  }
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^ {2}[\w-]+:\s*$/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join("\n");
}

/**
 * Extract the executable `run:` commands for the step inside `jobBlock` whose
 * `name:` matches `stepNameRegex`, stripping YAML comment lines so ordering
 * assertions only ever consider real shell invocations.
 *
 * Implementation notes:
 * - Steps in the workflow are list items keyed by `- name:` at 6-space indent.
 * - A step's `run: |` block scalar body sits at >= 10-space indent until the
 *   next step marker or the next same-indent sibling key (e.g. `env:`).
 * - We return only the command lines, with `#`-prefixed comments removed,
 *   so a future edit that inserts `# db:push:ci` into a comment CANNOT satisfy
 *   an ordering assertion. (This is the CodeRabbit / codeant / augmentcode
 *   hardening ask on PR #9.)
 */
function extractStepRunBlock(jobBlock: string, stepNameRegex: RegExp): string {
  const lines = jobBlock.split(/\r?\n/);
  const stepHeaderIdx = lines.findIndex(
    (l) => /^ {6}- name:\s+/.test(l) && stepNameRegex.test(l),
  );
  if (stepHeaderIdx === -1) {
    throw new Error(
      `Step matching ${stepNameRegex} not found in job block. Job starts with: ${lines[0]}`,
    );
  }
  let runIdx = -1;
  for (let i = stepHeaderIdx + 1; i < lines.length; i++) {
    if (/^ {6}- name:\s+/.test(lines[i])) break; // reached next step
    if (/^ {8}run:\s*\|?\s*$/.test(lines[i])) {
      runIdx = i;
      break;
    }
  }
  if (runIdx === -1) {
    throw new Error(
      `Step matching ${stepNameRegex} has no 'run: |' block. Header line: ${lines[stepHeaderIdx]}`,
    );
  }
  const runCmdLines: string[] = [];
  for (let i = runIdx + 1; i < lines.length; i++) {
    if (/^ {6}- name:\s+/.test(lines[i])) break; // next step
    if (/^ {8}[\w-]+:/.test(lines[i])) break; // sibling key (env:, with:, shell:)
    if (!/^ {10}/.test(lines[i]) && lines[i].trim() !== "") break; // end of block scalar
    const content = lines[i].replace(/^ {10}/, "");
    if (content.trim().startsWith("#")) continue; // drop pure comment lines
    runCmdLines.push(content);
  }
  return runCmdLines.join("\n");
}

describe("CI postgres-schema-check migration order contract", () => {
  const workflow = readWorkflow();
  const jobBlock = extractJobBlock(workflow, "postgres-schema-check");
  const bootstrapRun = extractStepRunBlock(jobBlock, /Bootstrap Drizzle schema/i);

  it("defines the postgres-schema-check job", () => {
    expect(jobBlock).toMatch(/^ {2}postgres-schema-check:\s*$/m);
    expect(jobBlock).toContain("services:");
    expect(jobBlock).toMatch(/image:\s+postgres:/);
  });

  it("bootstraps the Drizzle schema BEFORE replaying hand-written SQL migrations", () => {
    // Scoped to the bootstrap step's run: commands only (comments stripped),
    // so a YAML comment or some other step's text can never satisfy this.
    const pushPositions: number[] = [];
    const pushRe = /\bdb:push:ci\b/g;
    let m: RegExpExecArray | null;
    while ((m = pushRe.exec(bootstrapRun)) !== null) pushPositions.push(m.index);
    const applyIdx = bootstrapRun.search(/\bscripts\/apply-migrations\.mjs\b/);

    expect(pushPositions.length, "db:push:ci must appear at least twice in the bootstrap step").toBeGreaterThanOrEqual(2);
    expect(applyIdx, "apply-migrations.mjs must appear in the bootstrap step").toBeGreaterThan(-1);
    expect(
      pushPositions[0],
      "drizzle-kit push (db:push:ci) must run BEFORE scripts/apply-migrations.mjs on greenfield CI",
    ).toBeLessThan(applyIdx);
  });

  it("runs a second db:push:ci AFTER the SQL migrations to verify idempotency", () => {
    // Assert against real command positions in the bootstrap step, not any
    // substring that happens to contain "db:push:ci" somewhere in the job.
    const pushPositions: number[] = [];
    const pushRe = /\bdb:push:ci\b/g;
    let m: RegExpExecArray | null;
    while ((m = pushRe.exec(bootstrapRun)) !== null) pushPositions.push(m.index);
    const applyIdx = bootstrapRun.search(/\bscripts\/apply-migrations\.mjs\b/);

    expect(applyIdx, "apply-migrations.mjs must appear in the bootstrap step").toBeGreaterThan(-1);
    expect(pushPositions.length, "bootstrap step must contain two db:push:ci invocations").toBe(2);
    expect(
      pushPositions[pushPositions.length - 1],
      "Second db:push:ci must run AFTER apply-migrations.mjs to prove schema convergence",
    ).toBeGreaterThan(applyIdx);
  });

  it("uses an accurate step name that reflects the drizzle-first bootstrap", () => {
    // Guard against someone renaming / rewriting the step back to the misleading
    // "Apply SQL migrations and verify idempotent drizzle push" label without
    // also restoring drizzle-first ordering.
    expect(jobBlock).toMatch(/name:\s+Bootstrap Drizzle schema/);
  });

  it("does not regress to running apply-migrations.mjs before any drizzle push", () => {
    // Belt-and-braces: explicitly rule out the historical broken one-liner that
    // started with `node scripts/apply-migrations.mjs && npm run db:push:ci`.
    expect(bootstrapRun).not.toMatch(
      /node\s+scripts\/apply-migrations\.mjs\s*&&\s*npm\s+run\s+db:push:ci/,
    );
  });
});
