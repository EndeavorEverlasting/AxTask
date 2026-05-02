#!/usr/bin/env node
/**
 * AxTask local backup helper
 *
 * This script does not perform an authenticated backup from the CLI.
 * It checks the local environment, prints the available options, and exits cleanly.
 *
 * For a real backup, use the authenticated web UI or curl against
 * /api/account/export with a valid session.
 */

import { existsSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(process.cwd());
const envPath = path.join(rootDir, ".env");
const hasEnv = existsSync(envPath);

const databaseUrl = process.env.DATABASE_URL || (hasEnv ? "(check .env)" : "not set");

function printHeader() {
  console.log("AxTask Local Backup Helper");
  console.log("==========================");
}

function printEnvironment() {
  console.log("\nEnvironment check:");
  console.log(`  DATABASE_URL: ${databaseUrl ? "present" : "missing"}`);
  console.log(`  NODE_ENV:     ${process.env.NODE_ENV || "not set"}`);
}

function printOptions() {
  console.log("\nBackup options:");
  console.log("  1. Manual JSON export (web UI):");
  console.log('     Settings -> Import/Export -> "Download JSON backup"');
  console.log("     Endpoint: GET /api/account/export (requires auth + step-up in production)");
  console.log("\n  2. PostgreSQL pg_dump (local/self-hosted):");
  console.log(`     pg_dump $DATABASE_URL > axtask-pg-backup-${new Date().toISOString().slice(0, 10)}.sql`);
  console.log("\n  3. Docker volume backup:");
  console.log("     docker run --rm -v axtask_postgres_data:/data -v $(pwd):/backup alpine tar cvf /backup/postgres-backup.tar /data");
}

function printLimitations() {
  console.log("\nCurrent limitations:");
  console.log("  - Automated scheduled backups require BACKUP_SCHEDULER_ENABLED=true on the server.");
  console.log("  - CLI authenticated export is not yet supported (no session token flow).");
  console.log("  - The status endpoint reports the real last completed backup from the ledger.");
}

function printNextSteps() {
  console.log("\nNext steps:");
  console.log("  - Use the web UI for regular JSON exports.");
  console.log("  - Schedule pg_dump via cron or Windows Task Scheduler for DB-level backups.");
  console.log("  - See docs/BACKUP_AND_RESTORE.md for full details.");
}

printHeader();
printEnvironment();
printOptions();
printLimitations();
printNextSteps();

console.log("\nExiting cleanly. No files were written.");
process.exit(0);
