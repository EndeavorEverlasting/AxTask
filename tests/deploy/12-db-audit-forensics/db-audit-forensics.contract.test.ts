/**
 * Static safety contracts for production DB forensics and targeted api_request recovery.
 * These tests intentionally do not import the CLI scripts, so collection can never
 * open a database connection as a side effect.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const auditSource = fs.readFileSync(
  path.join(repoRoot, "scripts", "db-size-audit.mjs"),
  "utf8",
);
const reclaimSource = fs.readFileSync(
  path.join(repoRoot, "scripts", "db-reclaim-api-request.mjs"),
  "utf8",
);

describe("[12-db-audit-forensics] db-size-audit.mjs --forensics", () => {
  it("is read-only and exposes security_events forensic evidence", () => {
    expect(auditSource).toContain("securityEventsForensics");
    expect(auditSource).toContain("security_events");
    expect(auditSource).toContain("event_type");
    expect(auditSource).toContain("trg_suppress_api_request_security_events");
    expect(auditSource).toContain("9999_disable_api_request_security_events.sql");
    expect(auditSource).toContain("n_live_tup");
    expect(auditSource).toContain("n_dead_tup");
    expect(auditSource).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(auditSource).not.toMatch(/\bTRUNCATE\b/i);
    expect(auditSource).not.toMatch(/\bVACUUM\s+FULL\b/i);
  });

  it("measures TOAST as a relation instead of an invalid relation fork", () => {
    expect(auditSource).toContain("reltoastrelid");
    expect(auditSource).toContain("pg_indexes_size('public.security_events'::regclass)");
    expect(auditSource).not.toContain("pg_relation_size('security_events', 'toast')");
  });

  it("does not manufacture physical-bloat bytes from heap/live-row averages", () => {
    expect(auditSource).toContain("physicalBloatBytes: null");
    expect(auditSource).toContain("Dead-tuple statistics can indicate pressure");
    expect(auditSource).not.toContain("expectedHeapSize = forensics.liveRows * avgTupleSize");
    expect(auditSource).not.toContain("bloatBytes = forensics.heapSize - expectedHeapSize");
  });

  it("treats only origin/always triggers as active normal-session containment", () => {
    expect(auditSource).toContain('["O", "A"].includes');
    expect(auditSource).toContain("triggerEnableCode");
  });
});

describe("[12-db-audit-forensics] db-reclaim-api-request.mjs safety", () => {
  it("is dry-run by default and requires explicit execute", () => {
    expect(reclaimSource).toContain('const execute = args.has("execute")');
    expect(reclaimSource).toContain("const dryRun = !execute");
  });

  it("requires production intent and explicit confirmation for mutation", () => {
    expect(reclaimSource).toContain("refusing mutation without --prod");
    expect(reclaimSource).toContain('physicalReclaim ? "VACUUM_FULL" : "YES"');
    expect(reclaimSource).toContain("--confirm=${expectedConfirmation}");
  });

  it("treats only true loopback hosts as local", () => {
    expect(reclaimSource).toContain("function isLoopbackDatabase");
    expect(reclaimSource).toContain('"localhost"');
    expect(reclaimSource).toContain('"127.0.0.1"');
    expect(reclaimSource).toContain('"::1"');
    expect(reclaimSource).not.toContain('host.startsWith("10.")');
    expect(reclaimSource).not.toContain('host.startsWith("192.168.")');
    expect(reclaimSource).not.toContain('host.endsWith(".local")');
  });

  it("requires --force-production for non-loopback mutation", () => {
    expect(reclaimSource).toContain("!isLoopbackDatabase(url) && !forceProduction");
    expect(reclaimSource).toContain("--force-production");
  });

  it("never logs even a masked DATABASE_URL", () => {
    expect(reclaimSource).not.toContain("maskedUrl");
    expect(reclaimSource).not.toContain(":***@");
    expect(reclaimSource).toContain('target=${isLoopbackDatabase(url) ? "loopback" : "non-loopback"}');
  });

  it("never truncates security_events or drops indexes", () => {
    expect(reclaimSource).not.toMatch(/TRUNCATE\s+(TABLE\s+)?security_events/i);
    expect(reclaimSource).not.toMatch(/DROP\s+INDEX/i);
    expect(reclaimSource).toContain("event_type = 'api_request'");
  });

  it("parameterizes retention and batch size", () => {
    expect(reclaimSource).toContain("$1::int * interval '1 day'");
    expect(reclaimSource).toContain("LIMIT $2");
    expect(reclaimSource).toContain("[days, size]");
    expect(reclaimSource).toContain("--batch-size");
    expect(reclaimSource).toContain("--retention-days");
  });

  it("commits each delete batch independently instead of one giant transaction", () => {
    expect(reclaimSource).toContain("each bounded DELETE statement");
    expect(reclaimSource).not.toContain('client.query("BEGIN")');
    expect(reclaimSource).not.toContain('client.query("COMMIT")');
  });

  it("keeps physical reclaim a separate explicit operation", () => {
    expect(reclaimSource).toContain('const physicalReclaim = args.has("vacuum-full")');
    expect(reclaimSource).toContain("VACUUM_FULL");
    expect(reclaimSource).toContain("wouldVacuumFull: physicalReclaim");
    expect(reclaimSource).toContain('mode: "logical-cleanup"');
    expect(reclaimSource).toContain("vacuumFull: false");
  });

  it("requires origin-active containment around mutation and verification", () => {
    expect(reclaimSource).toContain("function getContainmentState");
    expect(reclaimSource).toContain('["O", "A"].includes(code)');
    expect(reclaimSource).toContain("assertContainmentActive(containmentBefore");
    expect(reclaimSource).toContain("assertContainmentActive(containmentAfter");
  });

  it("refuses VACUUM FULL before logical cleanup and rechecks after rewrite", () => {
    expect(reclaimSource).toContain("refusing VACUUM FULL while");
    expect(reclaimSource).toContain("run logical cleanup first");
    expect(reclaimSource).toContain("physical reclaim completed but");
    expect(reclaimSource).toContain("eligibleAfter !== 0");
  });

  it("does not pretend non-api counts are an atomic concurrency invariant", () => {
    expect(reclaimSource).toContain("nonApiRequestDelta");
    expect(reclaimSource).toContain("concurrent external activity");
    expect(reclaimSource).toContain("DELETE predicate cannot target those rows");
    expect(reclaimSource).not.toContain("non_api_request_preserved");
  });

  it("validates CLI numeric bounds before SQL execution", () => {
    expect(reclaimSource).toContain("function parseIntegerArg");
    expect(reclaimSource).toContain("must be an integer between");
    expect(reclaimSource).toContain("max: 50000");
  });
});
