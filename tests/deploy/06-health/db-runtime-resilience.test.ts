// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DB_CONNECTION_TIMEOUT_MS,
  resolveDbConnectionTimeoutMs,
  stripDatabaseUrlApplicationName,
} from "../../../server/db-runtime";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");

describe("[06-health] runtime DB connection acquisition", () => {
  it("defaults to five seconds instead of node-postgres no-timeout behavior", () => {
    expect(DEFAULT_DB_CONNECTION_TIMEOUT_MS).toBe(5_000);
    expect(resolveDbConnectionTimeoutMs(undefined)).toBe(5_000);
    expect(resolveDbConnectionTimeoutMs(" ")).toBe(5_000);
  });

  it("accepts operator tuning only inside the safe 1s-30s range", () => {
    expect(resolveDbConnectionTimeoutMs("2500")).toBe(2_500);
    expect(resolveDbConnectionTimeoutMs("250")).toBe(1_000);
    expect(resolveDbConnectionTimeoutMs("60000")).toBe(30_000);
    expect(resolveDbConnectionTimeoutMs("not-a-number")).toBe(5_000);
  });

  it("removes URL-level application_name without dropping other connection parameters", () => {
    expect(
      stripDatabaseUrlApplicationName(
        "postgresql://user:pass@example.test/db?sslmode=require&application_name=provider-name&connect_timeout=9",
      ),
    ).toBe(
      "postgresql://user:pass@example.test/db?sslmode=require&connect_timeout=9",
    );
    expect(
      stripDatabaseUrlApplicationName(
        "postgresql://user:pass@example.test/db?application_name=override#anchor",
      ),
    ).toBe("postgresql://user:pass@example.test/db#anchor");
    expect(
      stripDatabaseUrlApplicationName("postgresql://user:pass@example.test/db"),
    ).toBe("postgresql://user:pass@example.test/db");
  });

  it("wires the bounded timeout and enforced AxTask attribution into the pool", () => {
    const dbSource = fs.readFileSync(path.join(repoRoot, "server", "db.ts"), "utf8");
    expect(dbSource).toMatch(/connectionString:\s*stripDatabaseUrlApplicationName\(/);
    expect(dbSource).toMatch(/connectionTimeoutMillis:\s*resolveDbConnectionTimeoutMs\(/);
    expect(dbSource).toMatch(/AXTASK_DB_CONNECTION_TIMEOUT_MS/);
    expect(dbSource).toMatch(/application_name:\s*["']axtask["']/);
  });
});
