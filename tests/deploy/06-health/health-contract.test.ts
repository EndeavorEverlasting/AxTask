/**
 * Contract: server/index.ts mounts DB-free /health liveness and DB-backed /ready
 * readiness, while render.yaml uses /health for the platform probe.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");

describe("[06-health] server health endpoints", () => {
  const indexSrc = fs.readFileSync(path.join(repoRoot, "server", "index.ts"), "utf8");
  const dbRuntimeSrc = fs.readFileSync(path.join(repoRoot, "server", "db-runtime.ts"), "utf8");
  const dbSrc = fs.readFileSync(path.join(repoRoot, "server", "db.ts"), "utf8");

  it("mounts GET /health", () => {
    expect(indexSrc).toMatch(/app\.get\(\s*["']\/health["']/);
  });

  it("mounts GET /ready", () => {
    expect(indexSrc).toMatch(/app\.get\(\s*["']\/ready["']/);
  });

  it("/ready delegates to the bounded single-flight DB probe", () => {
    expect(indexSrc).toMatch(/\/ready[\s\S]{0,800}probeDatabase\(pool\)/i);
    expect(dbRuntimeSrc).toMatch(/text:\s*["']SELECT 1["']/i);
    expect(dbRuntimeSrc).toMatch(/query_timeout:\s*DB_READINESS_QUERY_TIMEOUT_MS/);
    expect(dbRuntimeSrc).toMatch(/const probeStates = new WeakMap/);
  });

  it("bounds new connection acquisition without imposing a global statement timeout", () => {
    expect(dbSrc).toMatch(/connectionTimeoutMillis/);
    expect(dbSrc).toMatch(/application_name:\s*["']axtask["']/);
    expect(dbSrc).not.toMatch(/statement_timeout\s*:/);
    expect(dbSrc).not.toMatch(/query_timeout\s*:/);
  });

  it("/ready exposes only coarse DB failure diagnostics", () => {
    const readyBlock = indexSrc.match(
      /app\.get\(\s*["']\/ready["'][\s\S]{0,2600}?\n\}\);/,
    )?.[0];
    expect(readyBlock, "/ready handler block not found; update the regex").toBeTruthy();
    expect(readyBlock).toContain("errorClass");
    expect(readyBlock).toContain("retryable");
    expect(readyBlock).toContain("Retry-After");
    expect(readyBlock).not.toMatch(/DATABASE_URL|connectionString|password/i);
  });

  it("/health does NOT touch the DB", () => {
    const healthBlockMatch = indexSrc.match(
      /app\.get\(\s*["']\/health["'][\s\S]{0,500}?\}\s*\)/,
    );
    expect(healthBlockMatch).toBeTruthy();
    const healthBody = healthBlockMatch?.[0] ?? "";
    expect(healthBody).not.toMatch(/SELECT/i);
    expect(healthBody).not.toMatch(/pool\.query/i);
    expect(healthBody).not.toMatch(/probeDatabase/i);
  });

  it("classifies known runtime DB errors before building the API error response", () => {
    expect(indexSrc).toMatch(/const dbFailure = classifyDbRuntimeError\(err\)/);
    expect(indexSrc).toMatch(/dbFailure && rawStatus >= 500 \? 503 : rawStatus/);
    expect(indexSrc).toMatch(/errorClass:\s*dbFailure\.errorClass/);
    expect(indexSrc).toMatch(/requestId:\s*ctx\?\.requestId/);
  });

  it("marks centralized 5xx handling so the finish hook cannot append it again", () => {
    expect(indexSrc).toMatch(/status >= 500[\s\S]{0,180}__axtaskApiErrorEmitted = true/);
  });

  it("alerts only for centralized 5xx errors", () => {
    expect(indexSrc).toMatch(/if \(status >= 500\)[\s\S]{0,500}notifyAdminsOfApiError/);
  });

  it("does not recursively append classified DB incidents to security_events", () => {
    expect(indexSrc).toMatch(
      /if \(dbFailure\)[\s\S]{0,1200}else \{[\s\S]{0,500}appendSecurityEvent\(/,
    );
    expect(indexSrc).toMatch(/appendSecurityEvent\([\s\S]{0,1200}\.catch\(/);
  });

  it("installs the DB-confirmed fallback for route handlers that swallow their original 5xx", () => {
    expect(indexSrc).toMatch(/installDb5xxFallback\(app/);
  });
});

describe("[06-health] render.yaml health config", () => {
  const renderYaml = fs.readFileSync(path.join(repoRoot, "render.yaml"), "utf8");

  it("uses DB-free /health for Render liveness", () => {
    expect(renderYaml).toMatch(/healthCheckPath:\s*\/health/);
    expect(renderYaml).not.toMatch(/healthCheckPath:\s*\/ready/);
  });

  it("autoDeploy is explicitly set", () => {
    expect(renderYaml).toMatch(/autoDeploy:\s*(true|false)/);
  });

  it("if autoDeploy is true, the capacity gate must be wired before migrations", () => {
    const autoOn = /autoDeploy:\s*true/.test(renderYaml);
    if (!autoOn) return;
    const startScript = fs.readFileSync(
      path.join(repoRoot, "scripts", "production-start.mjs"),
      "utf8",
    );
    expect(startScript).toMatch(/check-db-capacity\.mjs/);
  });
});
