// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  classifyDbRuntimeError,
  getDbPoolSnapshot,
  probeDatabase,
} from "../../../server/db-runtime";

function errorWith(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

describe("[06-health] runtime DB failure classification", () => {
  it.each([
    [errorWith("ECONNREFUSED", "connect ECONNREFUSED"), "DB_CONNECTION_FAILED", true],
    [errorWith("08006", "connection failure"), "DB_CONNECTION_FAILED", true],
    [errorWith("28P01", "password authentication failed"), "DB_AUTH_FAILED", false],
    [errorWith("ETIMEDOUT", "connection timeout"), "DB_TIMEOUT", true],
    [errorWith("53300", "too many connections"), "DB_POOL_EXHAUSTED", true],
    [errorWith("53100", "project size limit has been exceeded"), "DB_CAPACITY_LIMIT", false],
    [errorWith("55P03", "lock timeout"), "DB_LOCK_CONTENTION", true],
    [errorWith("42P01", "relation tasks_shadow does not exist"), "DB_SCHEMA_MISMATCH", false],
    [errorWith("23505", "unique violation"), "DB_UNKNOWN", false],
  ])("classifies %s as %s", (error, expectedClass, retryable) => {
    expect(classifyDbRuntimeError(error)).toMatchObject({
      errorClass: expectedClass,
      retryable,
    });
  });

  it("returns null for an unrelated application error", () => {
    expect(classifyDbRuntimeError(new Error("bad form input"))).toBeNull();
  });
});

describe("[06-health] DB readiness probe", () => {
  it("returns latency and pool counts after SELECT 1 succeeds", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
      totalCount: 3,
      idleCount: 2,
      waitingCount: 0,
    };

    const result = await probeDatabase(pool);

    expect(pool.query).toHaveBeenCalledWith("SELECT 1");
    expect(result).toMatchObject({
      reachable: true,
      pool: { totalCount: 3, idleCount: 2, waitingCount: 0 },
    });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns a coarse retryable classification when the DB is temporarily unavailable", async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(errorWith("57P03", "cannot connect now")),
      totalCount: 10,
      idleCount: 0,
      waitingCount: 4,
    };

    await expect(probeDatabase(pool)).resolves.toMatchObject({
      reachable: false,
      errorClass: "DB_CONNECTION_FAILED",
      retryable: true,
      code: "57P03",
      pool: { totalCount: 10, idleCount: 0, waitingCount: 4 },
    });
  });

  it("normalizes missing pool counters instead of throwing", () => {
    expect(getDbPoolSnapshot({})).toEqual({
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
    });
  });
});
