// @vitest-environment node
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  users,
  communityPosts,
  communityReplies,
  attachmentAssets,
  storagePolicies,
  tasks,
} from "@shared/schema";

/** Helper: extract column names from a Drizzle table definition. */
function colNames(table: Parameters<typeof getTableColumns>[0]): Set<string> {
  return new Set(Object.values(getTableColumns(table)).map((c) => c.name));
}

describe("users table Drizzle schema", () => {
  it("includes TOTP columns required by auth and storage", () => {
    const names = colNames(users);
    expect(names.has("totp_secret_ciphertext")).toBe(true);
    expect(names.has("totp_enabled_at")).toBe(true);
  });
});

describe("community tables Drizzle schema", () => {
  it("community_posts has all required columns", () => {
    const names = colNames(communityPosts);
    for (const col of ["id", "avatar_key", "avatar_name", "title", "body", "category", "created_at"]) {
      expect(names.has(col), `community_posts missing column: ${col}`).toBe(true);
    }
  });

  it("community_replies has all required columns including post_id FK", () => {
    const names = colNames(communityReplies);
    for (const col of ["id", "post_id", "user_id", "avatar_key", "display_name", "body", "created_at"]) {
      expect(names.has(col), `community_replies missing column: ${col}`).toBe(true);
    }
  });
});

describe("attachment & storage Drizzle schema", () => {
  it("attachment_assets includes task_id column for task-level attachments", () => {
    const names = colNames(attachmentAssets);
    expect(names.has("task_id"), "attachment_assets missing task_id column").toBe(true);
    expect(names.has("user_id")).toBe(true);
    expect(names.has("kind")).toBe(true);
    expect(names.has("byte_size")).toBe(true);
  });

  it("storage_policies uses bigint for max_attachment_bytes (supports 15 GB+)", () => {
    const cols = getTableColumns(storagePolicies);
    const maxBytes = Object.values(cols).find((c) => c.name === "max_attachment_bytes");
    expect(maxBytes, "storage_policies missing max_attachment_bytes column").toBeDefined();
    // Drizzle pgBigint uses columnType "PgBigInt53" (mode:"number") or "PgBigInt64" (mode:"bigint")
    expect((maxBytes as any).columnType).toMatch(/PgBigInt/);
  });
});

describe("tasks table Drizzle schema", () => {
  it("has core columns required by the app", () => {
    const names = colNames(tasks);
    for (const col of ["id", "user_id", "activity", "notes", "status", "date", "priority"]) {
      expect(names.has(col), `tasks missing column: ${col}`).toBe(true);
    }
  });
});
