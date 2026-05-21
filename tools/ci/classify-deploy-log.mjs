#!/usr/bin/env node
/**
 * Classify deployment/runtime logs into known incident classes.
 *
 * Usage:
 *   node tools/ci/classify-deploy-log.mjs path/to/render.log
 *   cat render.log | node tools/ci/classify-deploy-log.mjs
 */
import fs from "node:fs";

const inputPath = process.argv[2];
const input = inputPath
  ? fs.readFileSync(inputPath, "utf8")
  : fs.readFileSync(0, "utf8");

const signatures = [
  {
    id: "DRIZZLE_INTERACTIVE_TTY",
    severity: "critical",
    match: /Interactive prompts require a TTY terminal|promptNamedWithSchemasConflict|drizzle-kit.*push|Pulling schema from database/i,
    diagnosis: "Drizzle schema push was invoked in a non-interactive runtime and may require operator input.",
    action: "Remove startup-time Drizzle push. Route startup through production-start.mjs and run schema sync manually or through reviewed migrations.",
  },
  {
    id: "NODE_HEAP_OOM",
    severity: "critical",
    match: /JavaScript heap out of memory|Ineffective mark-compacts near heap limit|Allocation failed - JavaScript heap out of memory/i,
    diagnosis: "Node exhausted heap memory after or during startup.",
    action: "Identify whether the crash is idle, request-driven, or worker-driven. Add memory telemetry and isolate background workers before increasing plan size.",
  },
  {
    id: "SERVER_BOUND_PORT",
    severity: "info",
    match: /serving on port\s+\d+/i,
    diagnosis: "Express server successfully bound to a port.",
    action: "If users still see 502/503 after this, inspect health checks, process restarts, proxy routing, and post-boot crashes.",
  },
  {
    id: "MIGRATIONS_ALREADY_APPLIED",
    severity: "info",
    match: /\[migrate\] done\. 0 applied, .* skipped|\[migrate\] skip \(already applied\)/i,
    diagnosis: "Versioned SQL migrations appear to be present and already applied.",
    action: "Treat schema push failures separately from migration runner state.",
  },
  {
    id: "BACKUP_AIRLOCK_SCHEMA_MISSING",
    severity: "warning",
    match: /backup_records table missing; allowing migrations/i,
    diagnosis: "Migration airlock backup schema is not initialized, so migrations were allowed without backup-record enforcement.",
    action: "Initialize or document backup airlock expectations before making high-risk migrations.",
  },
  {
    id: "REGISTRATION_INVITE_IGNORED",
    severity: "warning",
    match: /INVITE_CODE is set but REGISTRATION_MODE is "open"/i,
    diagnosis: "Invite code is configured but registration mode is open, so invite protection is inactive.",
    action: "Set REGISTRATION_MODE=invite if invite-gated registration is desired.",
  },
];

const findings = signatures
  .filter((sig) => sig.match.test(input))
  .map(({ id, severity, diagnosis, action }) => ({ id, severity, diagnosis, action }));

const reportLines = [
  "# Deploy log classification",
  "",
  `Findings: ${findings.length}`,
  "",
  ...findings.flatMap((f) => [
    `## ${f.id}`,
    "",
    `Severity: ${f.severity}`,
    "",
    `Diagnosis: ${f.diagnosis}`,
    "",
    `Action: ${f.action}`,
    "",
  ]),
];

const report = `${reportLines.join("\n")}\n`;
console.log(report);

if (findings.some((f) => f.severity === "critical") && process.env.AXTASK_DEPLOY_LOG_CLASSIFIER_STRICT === "1") {
  process.exit(1);
}
