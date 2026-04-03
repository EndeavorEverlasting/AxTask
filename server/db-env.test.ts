// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
    return;
  }
  process.env.DATABASE_URL = originalDatabaseUrl;
});

describe("database environment requirements", () => {
  it("throws a clear error when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    vi.resetModules();
    await expect(
      import("./db"),
    ).rejects.toThrow("DATABASE_URL must be set");
  });

  it("initializes exports when DATABASE_URL is present", async () => {
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/axtask";
    vi.resetModules();

    const module = await import("./db");

    expect(module.pool).toBeDefined();
    expect(module.db).toBeDefined();

    await module.pool.end();
  });
});
