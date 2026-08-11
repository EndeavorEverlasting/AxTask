export type DbRuntimeFailureClass =
  | "DB_CONNECTION_FAILED"
  | "DB_AUTH_FAILED"
  | "DB_TIMEOUT"
  | "DB_POOL_EXHAUSTED"
  | "DB_CAPACITY_LIMIT"
  | "DB_LOCK_CONTENTION"
  | "DB_SCHEMA_MISMATCH"
  | "DB_UNKNOWN";

export type DbRuntimeDiagnostic = {
  errorClass: DbRuntimeFailureClass;
  retryable: boolean;
  code?: string;
};

export type DbPoolSnapshot = {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
};

export type DbReadinessResult = {
  reachable: boolean;
  latencyMs: number;
  pool: DbPoolSnapshot;
  errorClass?: DbRuntimeFailureClass;
  retryable?: boolean;
  code?: string;
};

type ErrorLike = {
  code?: unknown;
  message?: unknown;
};

type PoolLike = {
  query: (queryText: string) => Promise<unknown>;
  totalCount?: number;
  idleCount?: number;
  waitingCount?: number;
};

const CONNECTION_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "57P01",
  "57P02",
  "57P03",
]);

const LOCK_CODES = new Set(["55P03", "40P01"]);
const SCHEMA_CODES = new Set(["42P01", "42703"]);

function errorParts(error: unknown): { code: string; message: string } {
  if (!error || typeof error !== "object") {
    return { code: "", message: String(error ?? "") };
  }
  const value = error as ErrorLike;
  return {
    code: typeof value.code === "string" ? value.code.trim().toUpperCase() : "",
    message: typeof value.message === "string" ? value.message.toLowerCase() : "",
  };
}

function diagnostic(
  errorClass: DbRuntimeFailureClass,
  retryable: boolean,
  code: string,
): DbRuntimeDiagnostic {
  return {
    errorClass,
    retryable,
    ...(code ? { code } : {}),
  };
}

/**
 * Convert Postgres/node-postgres/network failures into a small stable taxonomy.
 * The taxonomy intentionally excludes raw SQL, parameters, hostnames, and
 * connection strings so it is safe to emit in production logs and 503 bodies.
 * Returns null when the error does not look database-related.
 */
export function classifyDbRuntimeError(error: unknown): DbRuntimeDiagnostic | null {
  const { code, message } = errorParts(error);

  if (code === "28P01" || code.startsWith("28")) {
    return diagnostic("DB_AUTH_FAILED", false, code);
  }

  if (
    code === "53100" ||
    message.includes("project size limit") ||
    message.includes("neon.max_cluster_size") ||
    message.includes("no space left on device")
  ) {
    return diagnostic("DB_CAPACITY_LIMIT", false, code);
  }

  if (
    code === "53300" ||
    message.includes("too many clients") ||
    message.includes("too many connections") ||
    message.includes("remaining connection slots are reserved")
  ) {
    return diagnostic("DB_POOL_EXHAUSTED", true, code);
  }

  if (code === "ETIMEDOUT" || message.includes("timeout expired") || message.includes("connection timeout")) {
    return diagnostic("DB_TIMEOUT", true, code);
  }

  if (
    LOCK_CODES.has(code) ||
    message.includes("lock timeout") ||
    message.includes("deadlock detected")
  ) {
    return diagnostic("DB_LOCK_CONTENTION", true, code);
  }

  if (
    SCHEMA_CODES.has(code) ||
    /relation .* does not exist/.test(message) ||
    /column .* does not exist/.test(message)
  ) {
    return diagnostic("DB_SCHEMA_MISMATCH", false, code);
  }

  if (
    CONNECTION_CODES.has(code) ||
    code.startsWith("08") ||
    message.includes("connection terminated unexpectedly") ||
    message.includes("connection terminated") ||
    message.includes("connection refused") ||
    message.includes("cannot connect now") ||
    message.includes("server closed the connection unexpectedly")
  ) {
    return diagnostic("DB_CONNECTION_FAILED", true, code);
  }

  // Five-character SQLSTATE codes are Postgres failures even when AxTask does
  // not yet have a more specific bucket. Unknown DB failures are not retried
  // automatically because write-safety and root cause are unproven.
  if (/^[0-9A-Z]{5}$/.test(code)) {
    return diagnostic("DB_UNKNOWN", false, code);
  }

  return null;
}

export function getDbPoolSnapshot(pool: Pick<PoolLike, "totalCount" | "idleCount" | "waitingCount">): DbPoolSnapshot {
  const asCount = (value: number | undefined) =>
    Number.isFinite(value) && Number(value) >= 0 ? Number(value) : 0;
  return {
    totalCount: asCount(pool.totalCount),
    idleCount: asCount(pool.idleCount),
    waitingCount: asCount(pool.waitingCount),
  };
}

/**
 * Cheap readiness probe used by /ready. It intentionally performs only SELECT 1
 * and reports coarse diagnostics; it never inspects application rows.
 */
export async function probeDatabase(pool: PoolLike): Promise<DbReadinessResult> {
  const startedAt = Date.now();
  try {
    await pool.query("SELECT 1");
    return {
      reachable: true,
      latencyMs: Math.max(0, Date.now() - startedAt),
      pool: getDbPoolSnapshot(pool),
    };
  } catch (error) {
    const classified =
      classifyDbRuntimeError(error) ?? diagnostic("DB_UNKNOWN", false, "");
    return {
      reachable: false,
      latencyMs: Math.max(0, Date.now() - startedAt),
      pool: getDbPoolSnapshot(pool),
      ...classified,
    };
  }
}
