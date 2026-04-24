// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

describe("deploy / schema workflow guards", () => {
  it("docker-compose migrate runs SQL migrations before drizzle db:push", () => {
    const composePath = path.join(projectRoot, "docker-compose.yml");
    const compose = fs.readFileSync(composePath, "utf8");

    expect(compose).toContain("migrate:");
    expect(compose).toMatch(
      /command:\s*\[\s*"sh",\s*"-c",\s*"node scripts\/apply-migrations\.mjs && npm run db:push\s*<\s*\/dev\/null"\s*\]/,
    );
    const migrateIdx = compose.indexOf("migrate:");
    const cmdIdx = compose.indexOf("node scripts/apply-migrations.mjs && npm run db:push");
    expect(cmdIdx).toBeGreaterThan(migrateIdx);
  });

  it("production Dockerfile CMD runs migrations then push then server", () => {
    const dockerfile = fs.readFileSync(path.join(projectRoot, "Dockerfile"), "utf8");
    const cmdMatch = dockerfile.match(/CMD\s*\[\s*"sh",\s*"-c",\s*"([^"]+)"\s*\]/);
    expect(cmdMatch, "Dockerfile CMD").toBeTruthy();
    const shellBody = cmdMatch![1];
    const applyIdx = shellBody.indexOf("node scripts/apply-migrations.mjs");
    const pushIdx = shellBody.indexOf("drizzle-kit push --force");
    const nodeIdx = shellBody.indexOf("node dist/index.js");
    expect(applyIdx).toBeLessThan(pushIdx);
    expect(pushIdx).toBeLessThan(nodeIdx);
    expect(shellBody).toMatch(/drizzle-kit push --force[^&|;]*<\s*\/dev\/null/);
  });

  it("docker-compose migrate closes stdin on drizzle-kit push", () => {
    const compose = fs.readFileSync(path.join(projectRoot, "docker-compose.yml"), "utf8");
    expect(compose).toMatch(/npm run db:push\s*<\s*\/dev\/null/);
  });

  it("verify-drizzle-deploy closes stdin on drizzle-kit push invocations", () => {
    const src = fs.readFileSync(
      path.join(projectRoot, "scripts", "verify-drizzle-deploy.mjs"),
      "utf8",
    );
    expect(src).toContain('closeStdin: true');
    expect(src).toContain('["ignore", "inherit", "inherit"]');
    const firstPush = src.indexOf('run("drizzle-kit push (1)"');
    const secondPush = src.indexOf('run("drizzle-kit push (2)"');
    expect(firstPush).toBeGreaterThan(-1);
    expect(secondPush).toBeGreaterThan(firstPush);
    expect(src.slice(firstPush, firstPush + 200)).toContain("closeStdin: true");
    expect(src.slice(secondPush, secondPush + 200)).toContain("closeStdin: true");
  });

  it("CI test-and-attest bootstraps Drizzle before SQL migrations, with stdin closed twice", () => {
    // Greenfield CI service containers need drizzle-kit push to run BEFORE
    // scripts/apply-migrations.mjs, because migrations/0001_youtube_probe_tables.sql
    // FK-references users(id) which only exists after Drizzle pushes. The trailing
    // db:push:ci re-run proves schema convergence (idempotency). Narrower assertions
    // on naming / denylisting the legacy one-liner live in
    // server/ci-migration-order.contract.test.ts.
    //
    // This guard scopes all ordering / count assertions to the bootstrap step's
    // `run:` block (comments stripped), so a YAML comment or some other step
    // that happens to mention db:push:ci can NEVER satisfy the ordering.
    const wf = fs.readFileSync(
      path.join(projectRoot, ".github", "workflows", "test-and-attest.yml"),
      "utf8",
    );
    const lines = wf.split(/\r?\n/);
    const jobStart = lines.findIndex((l) => l.trim() === "test-and-attest:");
    expect(jobStart, "test-and-attest job header").toBeGreaterThan(-1);
    let jobEnd = lines.length;
    for (let i = jobStart + 1; i < lines.length; i++) {
      if (/^ {2}[\w-]+:\s*$/.test(lines[i])) {
        jobEnd = i;
        break;
      }
    }
    const jobLines = lines.slice(jobStart, jobEnd);
    const jobBlock = jobLines.join("\n");

    const stepHeaderIdx = jobLines.findIndex(
      (l) => /^ {6}- name:\s+/.test(l) && /Bootstrap Drizzle schema/i.test(l),
    );
    expect(stepHeaderIdx, "Bootstrap Drizzle schema step header").toBeGreaterThan(-1);
    let runIdx = -1;
    for (let i = stepHeaderIdx + 1; i < jobLines.length; i++) {
      if (/^ {6}- name:\s+/.test(jobLines[i])) break;
      if (/^ {8}run:\s*\|?\s*$/.test(jobLines[i])) {
        runIdx = i;
        break;
      }
    }
    expect(runIdx, "bootstrap step must have a run: | block").toBeGreaterThan(-1);
    const runCmds: string[] = [];
    for (let i = runIdx + 1; i < jobLines.length; i++) {
      if (/^ {6}- name:\s+/.test(jobLines[i])) break;
      if (/^ {8}[\w-]+:/.test(jobLines[i])) break;
      if (!/^ {10}/.test(jobLines[i]) && jobLines[i].trim() !== "") break;
      const content = jobLines[i].replace(/^ {10}/, "");
      if (content.trim().startsWith("#")) continue;
      runCmds.push(content);
    }
    const runBlock = runCmds.join("\n");

    const pushPositions: number[] = [];
    const pushRe = /\bdb:push:ci\b/g;
    let m: RegExpExecArray | null;
    while ((m = pushRe.exec(runBlock)) !== null) pushPositions.push(m.index);
    const applyIdx = runBlock.search(/\bscripts\/apply-migrations\.mjs\b/);

    expect(pushPositions.length, "bootstrap step must run db:push:ci exactly twice").toBe(2);
    expect(applyIdx, "apply-migrations.mjs must appear in the bootstrap step").toBeGreaterThan(-1);
    expect(
      pushPositions[0],
      "drizzle-kit push (db:push:ci) must run BEFORE scripts/apply-migrations.mjs on greenfield CI",
    ).toBeLessThan(applyIdx);
    expect(
      pushPositions[1],
      "Second db:push:ci must run AFTER apply-migrations.mjs to prove schema convergence",
    ).toBeGreaterThan(applyIdx);

    const stdinCount = (runBlock.match(/<\s*\/dev\/null/g) || []).length;
    expect(
      stdinCount,
      "both db:push:ci invocations must close stdin (</dev/null)",
    ).toBeGreaterThanOrEqual(2);

    expect(
      runBlock,
      "legacy one-liner with apply-migrations before db:push:ci must not return",
    ).not.toMatch(/node\s+scripts\/apply-migrations\.mjs\s*&&\s*npm\s+run\s+db:push:ci/);

    // Sanity: the enclosing job block must still name the hardened step, so
    // renaming the step silently cannot disable this guard.
    expect(jobBlock).toMatch(/name:\s+Bootstrap Drizzle schema/);
  });

  it("offline-start applies SQL migrations and fingerprints migrations/*.sql", () => {
    const src = fs.readFileSync(path.join(projectRoot, "tools", "local", "offline-start.mjs"), "utf8");
    expect(src).toContain("buildMigrationsDirFingerprint");
    expect(src).toContain("ensureSqlMigrationsApplied");
    expect(src).toContain("apply-migrations.mjs");
    const validateIdx = src.indexOf("validateLocalEnv();");
    const sqlIdx = src.indexOf("ensureSqlMigrationsApplied();");
    const depsIdx = src.indexOf("ensureDependenciesSynced(previousState)");
    expect(validateIdx).toBeGreaterThanOrEqual(0);
    expect(sqlIdx).toBeGreaterThan(validateIdx);
    expect(depsIdx).toBeGreaterThan(sqlIdx);
  });

  it("dev-with-db-push runs apply-migrations before kit workarounds and db:push", () => {
    const src = fs.readFileSync(path.join(projectRoot, "tools", "local", "dev-with-db-push.mjs"), "utf8");
    const applyIdx = src.indexOf("apply-migrations.mjs");
    const preIdx = src.indexOf("pre-db-push-kit-workarounds.mjs");
    const pushIdx = src.indexOf('["run", "db:push"]');
    expect(applyIdx).toBeLessThan(preIdx);
    expect(preIdx).toBeLessThan(pushIdx);
  });

  it("package.json exposes db:push scripts used by compose and local tooling", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    expect(pkg.scripts["db:push"]).toBeTruthy();
    expect(pkg.scripts["db:push:ci"]).toBeTruthy();
    expect(pkg.scripts["db:push:verify"]).toContain("verify-drizzle-deploy.mjs");
    expect(pkg.scripts["start:local"]).toContain("offline-start.mjs");
    expect(pkg.scripts["dev:smart"]).toContain("offline-start.mjs");
    expect(pkg.scripts["local:env-init"]).toContain("copy-env-local.mjs");
  });

  it("npm run start uses production-start (migrations + drizzle push before server)", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    expect(pkg.scripts.start).toContain("production-start.mjs");
    expect(pkg.dependencies["drizzle-kit"]).toBeTruthy();
    const src = fs.readFileSync(path.join(projectRoot, "scripts", "production-start.mjs"), "utf8");
    const applyIdx = src.indexOf("apply-migrations.mjs");
    const pushIdx = src.indexOf('"drizzle-kit", "bin.cjs"');
    const serverSpawn = src.indexOf("spawn(process.execPath, [distIndex]");
    expect(applyIdx).toBeGreaterThan(-1);
    expect(pushIdx).toBeGreaterThan(applyIdx);
    expect(serverSpawn).toBeGreaterThan(pushIdx);
  });
});
