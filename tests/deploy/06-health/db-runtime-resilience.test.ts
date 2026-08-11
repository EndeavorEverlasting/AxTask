// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  DB_READINESS_QUERY_TIMEOUT_MS,
  DEFAULT_DB_CONNECTION_TIMEOUT_MS,
  classifyDbRuntimeError,
  getDbPoolSnapshot,
  probeDatabase,
  resolveDbConnectionTimeoutMs,
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
    [errorWith("57014", "canceling statement due to statement timeout"), "DB_TIMEOUT", true],
    [errorWith("53300", "too many connections"), "DB_POOL_EXHAUSTED", true],
    [errorWith("53100", "project size limit has been exceeded"), "DB_CAPACITY_LIMIT", false],
    [errorWith("55P03", "lock timeout"), "DB_LOCK_CONTENTION", true],
    [errorWith("42P01", "relation tasks_shadow does not exist"), "DB_SCHEMA_MISMATCH", false],
  ])("classifies %s as %s", (error, expectedClass, retryable) => {
    expect(classifyDbRuntimeError(error)).toMatchObject({
      errorClass: expectedClass,
      retryable,
    });
  });

  it("does not turn ordinary SQL constraint failures into outages", () => {
    expect(classifyDbRuntimeError(errorWith("23505", "unique violation"))).toBeNull();
  });

  it("does not classify uncoded socket-like application errors as database failures", () => {
    expect(classifyDbRuntimeError(new Error("connection refused by external API"))).toBeNull();
    expect(classifyDbRuntimeError(new Error("connection timeout"))).toBeNull();
  });

  it("allows message heuristics when the caller knows the error came from PostgreSQL", () => {
    expect(
      classifyDbRuntimeError(new Error("timeout exceeded when trying to connect"), {
        assumeDatabase: true,
      }),
    ).toMatchObject({ errorClass: "DB_TIMEOUT", retryable: true });
  });
});

describe("[06-health] runtime DB connection timeout", () => {
  it("defaults to a bounded timeout instead of no-timeout pool behavior", () => {
    expect(resolveDbConnectionTimeoutMs(undefined)).toBe(DEFAULT_DB_CONNECTION_TIMEOUT_MS);
    expect(DEFAULT_DB_CONNECTION_TIMEOUT_MS).toBe(5_000);
  });

  it("accepts operator tuning only inside the safe 1s-30s range", () => {
    expect(resolveDbConnectionTimeoutMs("2500")).toBe(2_500);
    expect(resolveDbConnectionTimeoutMs("250")).toBe(1_000);
    expect(resolveDbConnectionTimeoutMs("60000")).toBe(30_000);
    expect(resolveDbConnectionTimeoutMs("not-a-number")).toBe(DEFAULT_DB_CONNECTION_TIMEOUT_MS);
  });
});

describe("[06-health] DB readiness probe", () => {
  it("uses SELECT 1 with a readiness-only query timeout", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ one: 1 }] }),
      totalCount: 3,
      idleCount: 2,
      waitingCount: 0,
    };

    const result = await probeDatabase(pool);

    expect(pool.query).toHaveBeenCalledWith({
      text: "SELECT 1",
      query_timeout: DB_READINESS_QUERY_TIMEOUT_MS,
    });
    expect(result).toMatchObject({
      reachable: true,
      pool: { totalCount: 3, idleCount: 2, waitingCount: 0 },
    });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("classifies an uncoded node-postgres acquisition timeout inside the DB probe", async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(new Error("timeout exceeded when trying to connect")),
      totalCount: 10,
      idleCount: 0,
      waitingCount: 4,
    };

    await expect(probeDatabase(pool)).resolves.toMatchObject({
      reachable: false,
      errorClass: "DB_TIMEOUT",
      retryable: true,
      pool: { totalCount: 10, idleCount: 0, waitingCount: 4 },
    });
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

  it("single-flights concurrent readiness checks and briefly caches the result", async () => {
    let resolveQuery!: (value: unknown) => void;
    const queryPromise = new Promise((resolve) => {
      resolveQuery = resolve;
    });
    const pool = {
      query: vi.fn().mockReturnValue(queryPromise),
      totalCount: 1,
      idleCount: 0,
      waitingCount: 0,
    };

    const first = probeDatabase(pool);
    const second = probeDatabase(pool);
    expect(pool.query).toHaveBeenCalledTimes(1);
    resolveQuery({ rows: [{ one: 1 }] });
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);

    await probeDatabase(pool);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("normalizes missing pool counters instead of throwing", () => {
    expect(getDbPoolSnapshot({})).toEqual({
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
    });
  });
});
