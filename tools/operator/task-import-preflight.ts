import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { parseTasksFromCSV } from "../../client/src/lib/csv-utils";
import { buildTaskImportIdentityKey } from "../../shared/task-import-identity";

type ParsedTask = {
  date?: string | null;
  time?: string | null;
  activity?: string | null;
  notes?: string | null;
};

export interface TaskImportPreflightResult {
  file: string;
  sha256: string;
  rows: number;
  logicalTasks: number;
  duplicateRows: number;
  importUrl: string;
}

export function buildImportUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/import-export`;
}

export function inspectTaskImportCsv(
  filePath: string,
  options: { expectedRows?: number; expectedSha256?: string; baseUrl?: string } = {},
): TaskImportPreflightResult {
  const file = resolve(filePath);
  if (!existsSync(file)) throw new Error(`CSV not found: ${file}`);
  if (!file.toLowerCase().endsWith(".csv")) throw new Error(`Expected a .csv file: ${file}`);

  const bytes = readFileSync(file);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const expectedSha = options.expectedSha256?.trim().toLowerCase();
  if (expectedSha && sha256 !== expectedSha) {
    throw new Error(`SHA-256 mismatch: expected ${expectedSha}, got ${sha256}`);
  }

  const tasks = parseTasksFromCSV(bytes.toString("utf8")) as ParsedTask[];
  if (tasks.length === 0) throw new Error("CSV parsed successfully but contains no importable tasks.");

  if (options.expectedRows !== undefined && tasks.length !== options.expectedRows) {
    throw new Error(`Task count mismatch: expected ${options.expectedRows}, got ${tasks.length}`);
  }

  const logicalKeys = new Set(tasks.map(buildTaskImportIdentityKey));
  return {
    file,
    sha256,
    rows: tasks.length,
    logicalTasks: logicalKeys.size,
    duplicateRows: tasks.length - logicalKeys.size,
    importUrl: buildImportUrl(options.baseUrl || "http://127.0.0.1:5000"),
  };
}

export function parseTaskImportPreflightArgs(argv: string[]) {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const expectedRowsRaw = value("--expect");
  if (expectedRowsRaw !== undefined && !/^[1-9]\d*$/.test(expectedRowsRaw)) {
    throw new Error(`--expect must be a positive integer, got: ${expectedRowsRaw}`);
  }
  const expectedRows = expectedRowsRaw === undefined ? undefined : Number(expectedRowsRaw);
  return {
    file: value("--file"),
    expectedRows,
    expectedSha256: value("--sha256"),
    baseUrl: value("--base-url"),
    open: argv.includes("--open"),
  };
}

function openOperatorSurfaces(result: TaskImportPreflightResult): void {
  if (process.platform === "win32") {
    spawn("cmd.exe", ["/d", "/s", "/c", "start", "", result.importUrl], {
      detached: true,
      stdio: "ignore",
    }).unref();
    spawn("explorer.exe", [`/select,${result.file}`], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return;
  }

  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(opener, [result.importUrl], { detached: true, stdio: "ignore" }).unref();
}

async function main() {
  const args = parseTaskImportPreflightArgs(process.argv.slice(2));
  if (!args.file) {
    throw new Error(
      "Usage: npx tsx tools/operator/task-import-preflight.ts --file <tasks.csv> [--expect N] [--sha256 HEX] [--base-url URL] [--open]",
    );
  }

  const result = inspectTaskImportCsv(args.file, args);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  if (args.open) openOperatorSurfaces(result);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`[task-import-preflight] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
