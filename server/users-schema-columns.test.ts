// @vitest-environment node
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { users } from "@shared/schema";

describe("users table Drizzle schema", () => {
  it("includes TOTP columns required by auth and storage", () => {
    const cols = getTableColumns(users);
    const names = new Set(Object.values(cols).map((c) => c.name));
    expect(names.has("totp_secret_ciphertext")).toBe(true);
    expect(names.has("totp_enabled_at")).toBe(true);
  });
});
