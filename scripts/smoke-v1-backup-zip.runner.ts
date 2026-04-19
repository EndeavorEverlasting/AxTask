// tsx runner invoked by scripts/smoke-v1-backup-zip.mjs. Reads a single JSON
// backup file, runs every task row through normalizeV1TaskRow + insertTaskSchema,
// and prints a one-line JSON summary on stdout. Kept separate so the .mjs
// entry point stays dependency-free and the TypeScript import chain (which
// loads server/account-backup.ts and transitively server/db.ts) is isolated
// to a child process that receives a stubbed DATABASE_URL.
import { readFileSync } from "node:fs";
import { normalizeV1TaskRow } from "../server/account-backup";
import { insertTaskSchema } from "../shared/schema";

type Summary = {
  ok: boolean;
  tasks: number;
  rejected: number;
  schemaVersion: number | undefined;
  errors: { field: string; message: string }[];
};

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

  const b = bundle as {
    metadata?: { schemaVersion?: number };
    data?: { tasks?: unknown[] };
  };
  const schemaVersion = b?.metadata?.schemaVersion;
  const rawTasks = Array.isArray(b?.data?.tasks) ? (b!.data!.tasks as unknown[]) : [];

  let valid = 0;
  const errors: { field: string; message: string }[] = [];
  for (let i = 0; i < rawTasks.length; i++) {
    try {
      insertTaskSchema.parse(normalizeV1TaskRow(rawTasks[i]));
      valid++;
    } catch (e) {
      errors.push({
        field: String(i),
        message: e instanceof Error ? e.message.split("\n")[0] : "Validation failed",
      });
    }
  }

  const out: Summary = {
    ok: errors.length === 0,
    tasks: valid,
    rejected: errors.length,
    schemaVersion,
    errors,
  };
  process.stdout.write(JSON.stringify(out));
}

main();
