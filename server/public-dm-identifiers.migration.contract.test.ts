// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("public DM identifiers migration", () => {
  it("adds and enforces backfilled public identifier columns", () => {
    const migrationPath = path.join(__dirname, "..", "migrations", "0032_public_dm_identifiers.sql");
    const sql = fs.readFileSync(migrationPath, "utf8");

    expect(sql).toContain("ADD COLUMN IF NOT EXISTS public_handle");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS public_dm_token");
    expect(sql).toContain("UPDATE users");
    expect(sql).toContain("users_public_handle_unique");
    expect(sql).toContain("users_public_dm_token_unique");
    expect(sql).toContain("ALTER COLUMN public_handle SET NOT NULL");
    expect(sql).toContain("ALTER COLUMN public_dm_token SET NOT NULL");
    expect(sql).not.toMatch(/\bgen_random_bytes\s*\(/);
    expect(sql).toMatch(/substring\([\s\S]*gen_random_uuid\(\)/);
  });
});
