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
  query: (query: any) => Promise<unknown>;
  totalCount?: number;
  idleCount?: number;
  waitingCount?: number;
};

type ProbeState = {
  inFlight: Promise<DbReadinessResult> | null;
  cached: { expiresAt: number; result: DbReadinessResult } | null;
};

export const DEFAULT_DB_CONNECTION_TIMEOUT_MS = 5_000;
export const DB_READINESS_QUERY_TIMEOUT_MS = 2_000;
export const DB_READINESS_CACHE_MS = 1_000;
export const DB_READINESS_FAILURE_CACHE_MS = 5_000;
const MIN_DB_CONNECTION_TIMEOUT_MS = 1_000;
const MAX_DB_CONNECTION_TIMEOUT_MS = 30_000;

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
const probeStates = new WeakMap<object, ProbeState>();

export function resolveDbConnectionTimeoutMs(raw: string | undefined): number {
  if (!raw?.trim()) return DEFAULT_DB_CONNECTION_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_DB_CONNECTION_TIMEOUT_MS;
  return Math.max(
    MIN_DB_CONNECTION_TIMEOUT_MS,
    Math.min(MAX_DB_CONNECTION_TIMEOUT_MS, Math.round(parsed)),
  );
}

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
 * Convert PostgreSQL/node-postgres failures into a small stable taxonomy.
 * Message-only heuristics are accepted only when the caller already knows the
 * failure came from a PostgreSQL pool/query. The global HTTP error handler does
 * not set that flag, preventing unrelated socket/HTTP errors from being
 * mislabeled as database incidents.
 */
export function classifyDbRuntimeError(
  error: unknown,
  options?: { assumeDatabase?: boolean },
): DbRuntimeDiagnostic | null {
  const { code, message } = errorParts(error);
  const assumeDatabase = options?.assumeDatabase === true;

  if (code === "28P01" || code.startsWith("28")) {
    return diagnostic("DB_AUTH_FAILED", false, code);
  }
  if (
    code === "53100" ||
    (assumeDatabase && (
      message.includes("project size limit") ||
      message.includes("neon.max_cluster_size") ||
      message.includes("no space left on device")
    ))
  ) {
    return diagnostic("DB_CAPACITY_LIMIT", false, code);
  }
  if (
    code === "53300" ||
    (assumeDatabase && (
      message.includes("too many clients") ||
      message.includes("too many connections") ||
      message.includes("remaining connection slots are reserved")
    ))
  ) {
    return diagnostic("DB_POOL_EXHAUSTED", true, code);
  }
  if (
    code === "ETIMEDOUT" ||
    (code === "57014" && message.includes("statement timeout")) ||
    (assumeDatabase && (
      message.includes("timeout expired") ||
      message.includes("connection timeout") ||
      message.includes("timeout exceeded when trying to connect") ||
      message.includes("query read timeout")
    ))
  ) {
    return diagnostic("DB_TIMEOUT", true, code);
  }
  if (
    LOCK_CODES.has(code) ||
    (assumeDatabase && (
      message.includes("lock timeout") ||
      message.includes("deadlock detected")
    ))
  ) {
    return diagnostic("DB_LOCK_CONTENTION", true, code);
  }
  if (
    SCHEMA_CODES.has(code) ||
    (assumeDatabase && (
      /relation .* does not exist/.test(message) ||
      /column .* does not exist/.test(message)
    ))
  ) {
    return diagnostic("DB_SCHEMA_MISMATCH", false, code);
  }
  if (
    CONNECTION_CODES.has(code) ||
    code.startsWith("08") ||
    (assumeDatabase && (
      message.includes("connection terminated unexpectedly") ||
      message.includes("connection terminated") ||
      message.includes("connection refused") ||
      message.includes("cannot connect now") ||
      message.includes("server closed the connection unexpectedly")
    ))
  ) {
    return diagnostic("DB_CONNECTION_FAILED", true, code);
  }

  // Ordinary SQLSTATE constraint/application failures (for example 23505)
  // are intentionally not outages. Add explicit operational classes above.
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

async function runDatabaseProbe(pool: PoolLike): Promise<DbReadinessResult> {
  const startedAt = Date.now();
  try {
    // node-postgres accepts query_timeout on a Query config. Keep this timeout
    // local to readiness; normal application queries retain their semantics.
    await pool.query({
      text: "SELECT 1",
      query_timeout: DB_READINESS_QUERY_TIMEOUT_MS,
    });
    return {
      reachable: true,
      latencyMs: Math.max(0, Date.now() - startedAt),
      pool: getDbPoolSnapshot(pool),
    };
  } catch (error) {
    const classified =
      classifyDbRuntimeError(error, { assumeDatabase: true }) ??
      diagnostic("DB_UNKNOWN", false, "");
    return {
      reachable: false,
      latencyMs: Math.max(0, Date.now() - startedAt),
      pool: getDbPoolSnapshot(pool),
      ...classified,
    };
  }
}

/**
 * Bounded, single-flight, short-cache readiness probe. Concurrent callers share
 * one SELECT 1, and failures are cached a little longer so a health-check burst
 * cannot amplify a degraded pool.
 */
export async function probeDatabase(pool: PoolLike): Promise<DbReadinessResult> {
  const key = pool as object;
  let state = probeStates.get(key);
  if (!state) {
    state = { inFlight: null, cached: null };
    probeStates.set(key, state);
  }

  const now = Date.now();
  if (state.cached && now < state.cached.expiresAt) return state.cached.result;
  if (state.inFlight) return state.inFlight;

  state.inFlight = runDatabaseProbe(pool)
    .then((result) => {
      const cacheMs = result.reachable
        ? DB_READINESS_CACHE_MS
        : DB_READINESS_FAILURE_CACHE_MS;
      state!.cached = { expiresAt: Date.now() + cacheMs, result };
      return result;
    })
    .finally(() => {
      state!.inFlight = null;
    });

  return state.inFlight;
}
