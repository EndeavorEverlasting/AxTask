import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildTaskImportIdentityKey } from "../../shared/task-import-identity";
import {
  buildImportUrl,
  inspectTaskImportCsv,
  parseTaskImportPreflightArgs,
} from "./task-import-preflight";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function writeCsv(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "axtask-import-preflight-"));
  tempDirs.push(dir);
  const file = join(dir, "tasks.csv");
  writeFileSync(file, content, "utf8");
  return file;
}

describe("task import operator preflight", () => {
  it("validates the Sunday-style CSV shape and reports logical duplicates", () => {
    const file = writeCsv([
      "date,activity,notes,urgency,impact,effort,prerequisites,status",
      '2026-09-06,Task A,"Quoted, note",5,4,2,Thing,pending',
      '2026-09-06,Task A,"Quoted, note",5,4,2,Thing,pending',
      "2026-09-06,Task B,Second,3,3,3,,pending",
    ].join("\n"));

    const result = inspectTaskImportCsv(file, {
      expectedRows: 3,
      baseUrl: "https://example.test/",
    });

    expect(result.rows).toBe(3);
    expect(result.logicalTasks).toBe(2);
    expect(result.duplicateRows).toBe(1);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.importUrl).toBe("https://example.test/import-export");
  });

  it("fails closed when the expected row count or SHA does not match", () => {
    const file = writeCsv([
      "date,activity,notes,urgency,impact,effort,prerequisites,status",
      "2026-09-06,Task A,First,5,4,2,,pending",
    ].join("\n"));

    expect(() => inspectTaskImportCsv(file, { expectedRows: 2 })).toThrow("Task count mismatch");
    expect(() => inspectTaskImportCsv(file, { expectedSha256: "0".repeat(64) })).toThrow("SHA-256 mismatch");
  });

  it("rejects malformed or incomplete validation pins", () => {
    expect(() => parseTaskImportPreflightArgs(["--expect", "3oops"])).toThrow("positive integer");
    expect(() => parseTaskImportPreflightArgs(["--expect", "1e3"])).toThrow("positive integer");
    expect(() => parseTaskImportPreflightArgs(["--expect"])).toThrow("--expect requires a value");
    expect(() => parseTaskImportPreflightArgs(["--sha256"])).toThrow("--sha256 requires a value");
    expect(() => parseTaskImportPreflightArgs(["--sha256", "xyz"])).toThrow("64 hexadecimal");
    expect(() => parseTaskImportPreflightArgs(["--file", "--open"])).toThrow("--file requires a value");
    expect(parseTaskImportPreflightArgs(["--expect", "11"]).expectedRows).toBe(11);
  });

  it("keeps new logical identity keys collision-safe when fields contain pipes", () => {
    const left = buildTaskImportIdentityKey({ activity: "A|B", notes: "C" });
    const right = buildTaskImportIdentityKey({ activity: "A", notes: "B|C" });
    expect(left).not.toBe(right);
  });

  it("only builds operator URLs for HTTP(S) AxTask bases", () => {
    expect(buildImportUrl("http://127.0.0.1:5000")).toBe("http://127.0.0.1:5000/import-export");
    expect(buildImportUrl("https://example.test/root/?old=1#frag")).toBe("https://example.test/root/import-export");
    expect(() => buildImportUrl("file:///tmp/axtask")).toThrow("Unsupported AxTask base URL protocol");
  });
});
