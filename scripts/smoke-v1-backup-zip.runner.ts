// tsx runner invoked by scripts/smoke-v1-backup-zip.mjs. Reads a single JSON
// backup file and delegates to planAccountImport (the same pure function the
// account-import route uses) to fully validate both the bundle shape and
// every task row. Prints a one-line JSON summary on stdout.
//
// Kept separate so the .mjs entry point stays dependency-free and the
// TypeScript import chain (which loads server/account-backup.ts and
// transitively server/db.ts) is isolated to a child process that receives
// a stubbed DATABASE_URL.
import { readFileSync } from "node:fs";
import { planAccountImport } from "../server/account-backup";

type Summary = {
  ok: boolean;
  tasks: number;
  rejected: number;
  schemaVersion: number | undefined;
  errors: { field: string; message: string }[];
};

function extractSchemaVersion(bundle: unknown): number | undefined {
  const md = (bundle as { metadata?: { schemaVersion?: unknown } } | null)?.metadata;
  const v = md?.schemaVersion;
  return typeof v === "number" ? v : undefined;
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("smoke-v1 runner: missing file path");
    process.exit(2);
  }

  let bundle: unknown;
  try {
    bundle = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (e) {
    const out: Summary = {
      ok: false,
      tasks: 0,
      rejected: 0,
      schemaVersion: undefined,
      errors: [{ field: "root", message: e instanceof Error ? e.message : "JSON parse failed" }],
    };
    process.stdout.write(JSON.stringify(out));
    return;
  }

  // planAccountImport runs bundleSchema.safeParse first, so a non-backup JSON
  // (e.g. {}, package.json, anything without metadata/data.tasks in the right
  // shape) fails fast here instead of silently reporting "ok: true, tasks: 0".
  const plan = planAccountImport(bundle);
  const schemaVersion = extractSchemaVersion(bundle);

  const out: Summary = plan.ok
    ? {
        ok: true,
        tasks: plan.tasks.length,
        rejected: 0,
        schemaVersion: plan.schemaVersion ?? schemaVersion,
        errors: [],
      }
    : {
        ok: false,
        tasks: 0,
        rejected: plan.errors.length,
        schemaVersion,
        errors: plan.errors.map((e) => ({ field: e.field, message: e.message })),
      };
  process.stdout.write(JSON.stringify(out));
}

main();
