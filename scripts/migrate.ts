import { readFileSync, writeFileSync } from "fs";

function sumValidTableCounts(tc: Record<string, unknown>): { total: number; validPairs: [string, number][] } {
  const validPairs: [string, number][] = [];
  let total = 0;
  for (const [table, raw] of Object.entries(tc)) {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) continue;
    validPairs.push([table, n]);
    total += n;
  }
  return { total, validPairs };
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || !["export", "import"].includes(command)) {
    console.log("AxTask Data Migration Tool");
    console.log("");
    console.log("Usage:");
    console.log("  npx tsx scripts/migrate.ts export [--output file.json] [--user userId]");
    console.log("  npx tsx scripts/migrate.ts import --file file.json [--dry-run] [--mode preserve|remap]");
    console.log("");
    console.log("Commands:");
    console.log("  export    Export database to JSON file");
    console.log("  import    Import data from JSON file");
    console.log("");
    console.log("Options:");
    console.log("  --output  Output file path (default: axtask-export-<date>.json)");
    console.log("  --user    Export only a specific user's data");
    console.log("  --include-security-tables  Full export only: include password_reset_tokens (active) + security_logs");
    console.log("  --file    Input file path for import");
    console.log("  --dry-run Validate without writing to database");
    console.log("  --mode    Import mode: 'preserve' keeps original IDs (default), 'remap' generates new IDs");
    process.exit(1);
  }

  function getArg(name: string): string | undefined {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
  }
  const hasDryRun = args.includes("--dry-run");

  const { exportFullDatabase, exportUserData } = await import("../server/migration/export");
  const { importBundle } = await import("../server/migration/import");

  if (command === "export") {
    const userId = getArg("user");
    const includeSecurityTables = args.includes("--include-security-tables");
    const output = getArg("output") || `axtask-export-${userId ? "user" : "full"}-${new Date().toISOString().slice(0, 10)}.json`;

    console.log(userId ? `Exporting data for user: ${userId}` : "Exporting full database...");

    try {
      const bundle = userId
        ? await exportUserData(userId)
        : await exportFullDatabase({ includeSecurityTables });

      const rawTc = bundle.metadata?.tableCounts;
      const tcExport: Record<string, unknown> =
        rawTc && typeof rawTc === "object" && !Array.isArray(rawTc)
          ? (rawTc as Record<string, unknown>)
          : {};
      if (!rawTc || typeof rawTc !== "object" || Array.isArray(rawTc)) {
        console.warn("[migrate] export bundle missing or invalid metadata.tableCounts; using empty counts for summary.");
      }
      const { total: totalRecords, validPairs: exportPairs } = sumValidTableCounts(tcExport);
      console.log(`Export complete: ${totalRecords} records across ${exportPairs.length} tables`);

      for (const [table, count] of exportPairs) {
        if (count > 0) console.log(`  ${table}: ${count}`);
      }

      writeFileSync(output, JSON.stringify(bundle, null, 2));
      console.log(`Written to: ${output}`);
    } catch (err: any) {
      console.error("Export failed:", err.message);
      process.exit(1);
    }
  }

  if (command === "import") {
    const file = getArg("file");
    if (!file) {
      console.error("Error: --file is required for import");
      process.exit(1);
    }

    const rawMode = getArg("mode") || "preserve";
    if (rawMode !== "preserve" && rawMode !== "remap") {
      console.error("Error: --mode must be 'preserve' or 'remap'");
      process.exit(1);
    }
    const mode = rawMode as "preserve" | "remap";

    console.log(`Reading: ${file}`);
    let bundle: any;
    try {
      const raw = readFileSync(file, "utf-8");
      bundle = JSON.parse(raw);
    } catch (err: any) {
      console.error("Failed to read/parse file:", err.message);
      process.exit(1);
    }

    if (!bundle.metadata || !bundle.data) {
      console.error("Error: Invalid export bundle format");
      process.exit(1);
    }

    const tc = bundle.metadata.tableCounts;
    if (tc == null || typeof tc !== "object" || Array.isArray(tc)) {
      console.error("Error: bundle.metadata.tableCounts is missing or not a plain object");
      process.exit(1);
    }

    const { total: totalRecords, validPairs: importPairs } = sumValidTableCounts(tc as Record<string, unknown>);
    console.log(`Bundle: ${bundle.metadata.exportMode} export from ${bundle.metadata.exportedAt}`);
    console.log(`Total records: ${totalRecords} (${importPairs.length} tables with numeric counts)`);
    console.log(`Import mode: ${mode}`);

    if (hasDryRun) {
      console.log("\nRunning dry-run validation (checking DB conflicts)...");
    } else {
      console.log("\nImporting data...");
    }

    try {
      const result = await importBundle(bundle, { dryRun: hasDryRun, mode });

      console.log(`\nResult: ${result.success ? "SUCCESS" : "FAILED"}`);
      console.log(`Mode: ${result.mode}`);

      const totalInserted = Object.values(result.inserted).reduce((a, b) => a + b, 0);
      const totalSkipped = Object.values(result.skipped).reduce((a, b) => a + b, 0);
      const totalConflicts = Object.values(result.conflicts).reduce((a, b) => a + b, 0);
      const insertLabel = hasDryRun ? "Records would be inserted" : "Records inserted";
      console.log(`${insertLabel}: ${totalInserted}`);
      console.log(`Records skipped: ${totalSkipped}`);
      if (totalConflicts > 0) console.log(`ID conflicts: ${totalConflicts}`);

      for (const [table, count] of Object.entries(result.inserted)) {
        if (count > 0 || (result.skipped[table] || 0) > 0) {
          const conflictNote = result.conflicts[table] ? ` (${result.conflicts[table]} conflicts)` : "";
          console.log(`  ${table}: ${count} inserted, ${result.skipped[table] || 0} skipped${conflictNote}`);
        }
      }

      if (result.errors.length > 0) {
        console.log(`\nErrors (${result.errors.length}):`);
        for (const err of result.errors.slice(0, 20)) {
          console.log(`  [${err.table}#${err.rowIndex}] ${err.field}: ${err.message}`);
        }
        if (result.errors.length > 20) {
          console.log(`  ...and ${result.errors.length - 20} more`);
        }
      }

      if (result.warnings.length > 0) {
        console.log(`\nWarnings (${result.warnings.length}):`);
        for (const w of result.warnings.slice(0, 10)) {
          console.log(`  [${w.table}#${w.rowIndex}] ${w.field}: ${w.message}`);
        }
      }

      process.exit(result.success ? 0 : 1);
    } catch (err: any) {
      console.error("Import failed:", err.message);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
