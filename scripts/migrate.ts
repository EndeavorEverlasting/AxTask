import { readFileSync, writeFileSync } from "fs";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || !["export", "import"].includes(command)) {
    console.log("AxTask Data Migration Tool");
    console.log("");
    console.log("Usage:");
    console.log("  npx tsx scripts/migrate.ts export [--output file.json] [--user userId]");
    console.log("  npx tsx scripts/migrate.ts import --file file.json [--dry-run]");
    console.log("");
    console.log("Commands:");
    console.log("  export    Export database to JSON file");
    console.log("  import    Import data from JSON file");
    console.log("");
    console.log("Options:");
    console.log("  --output  Output file path (default: axtask-export-<date>.json)");
    console.log("  --user    Export only a specific user's data");
    console.log("  --file    Input file path for import");
    console.log("  --dry-run Validate without writing to database");
    process.exit(1);
  }

  function getArg(name: string): string | undefined {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
  }
  const hasDryRun = args.includes("--dry-run");

  const { exportFullDatabase, exportUserData } = await import("../server/migration/export");
  const { importBundle, validateBundle } = await import("../server/migration/import");

  if (command === "export") {
    const userId = getArg("user");
    const output = getArg("output") || `axtask-export-${userId ? "user" : "full"}-${new Date().toISOString().slice(0, 10)}.json`;

    console.log(userId ? `Exporting data for user: ${userId}` : "Exporting full database...");

    try {
      const bundle = userId
        ? await exportUserData(userId)
        : await exportFullDatabase();

      const totalRecords = Object.values(bundle.metadata.tableCounts).reduce((a, b) => a + b, 0);
      console.log(`Export complete: ${totalRecords} records across ${Object.keys(bundle.metadata.tableCounts).length} tables`);

      for (const [table, count] of Object.entries(bundle.metadata.tableCounts)) {
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

    const totalRecords = Object.values(bundle.metadata.tableCounts as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
    console.log(`Bundle: ${bundle.metadata.exportMode} export from ${bundle.metadata.exportedAt}`);
    console.log(`Total records: ${totalRecords}`);

    if (hasDryRun) {
      console.log("\nRunning dry-run validation...");
    } else {
      console.log("\nImporting data...");
    }

    try {
      const result = await importBundle(bundle, { dryRun: hasDryRun });

      console.log(`\nResult: ${result.success ? "SUCCESS" : "FAILED"}`);

      const totalInserted = Object.values(result.inserted).reduce((a, b) => a + b, 0);
      const totalSkipped = Object.values(result.skipped).reduce((a, b) => a + b, 0);
      console.log(`Records ${hasDryRun ? "would be" : ""} inserted: ${totalInserted}`);
      console.log(`Records skipped: ${totalSkipped}`);

      for (const [table, count] of Object.entries(result.inserted)) {
        if (count > 0 || (result.skipped[table] || 0) > 0) {
          console.log(`  ${table}: ${count} inserted, ${result.skipped[table] || 0} skipped`);
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
