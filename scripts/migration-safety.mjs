const DEFAULTS = Object.freeze({
  lockTimeoutMs: 5_000,
  statementTimeoutMs: 900_000,
  idleInTransactionTimeoutMs: 60_000,
  coordinationTimeoutMs: 30_000,
  coordinationRetryMs: 250,
  connectionTimeoutMs: 10_000,
});

export const MIGRATION_ADVISORY_LOCK_KEYS = Object.freeze([
  0x4158544b, // AXTK
  0x4d494752, // MIGR
]);

function positiveInteger(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (!/^\d+$/.test(String(raw))) {
    throw new Error(`${name} must be a positive integer number of milliseconds`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer number of milliseconds`);
  }
  return value;
}

export function migrationSafetyConfig(env = process.env) {
  return Object.freeze({
    lockTimeoutMs: positiveInteger(env, "MIGRATION_LOCK_TIMEOUT_MS", DEFAULTS.lockTimeoutMs),
    statementTimeoutMs: positiveInteger(env, "MIGRATION_STATEMENT_TIMEOUT_MS", DEFAULTS.statementTimeoutMs),
    idleInTransactionTimeoutMs: positiveInteger(
      env,
      "MIGRATION_IDLE_IN_TX_TIMEOUT_MS",
      DEFAULTS.idleInTransactionTimeoutMs,
    ),
    coordinationTimeoutMs: positiveInteger(
      env,
      "MIGRATION_COORDINATION_TIMEOUT_MS",
      DEFAULTS.coordinationTimeoutMs,
    ),
    coordinationRetryMs: positiveInteger(
      env,
      "MIGRATION_COORDINATION_RETRY_MS",
      DEFAULTS.coordinationRetryMs,
    ),
    connectionTimeoutMs: positiveInteger(
      env,
      "MIGRATION_CONNECTION_TIMEOUT_MS",
      DEFAULTS.connectionTimeoutMs,
    ),
  });
}

export function migrationPgOptions(config, existing = "") {
  const inherited = typeof existing === "string" ? existing.trim() : "";
  return [
    inherited,
    `-c lock_timeout=${config.lockTimeoutMs}ms`,
    `-c statement_timeout=${config.statementTimeoutMs}ms`,
    `-c idle_in_transaction_session_timeout=${config.idleInTransactionTimeoutMs}ms`,
  ].filter(Boolean).join(" ");
}

export async function configureMigrationSession(client, config) {
  const settings = [
    ["lock_timeout", config.lockTimeoutMs],
    ["statement_timeout", config.statementTimeoutMs],
    ["idle_in_transaction_session_timeout", config.idleInTransactionTimeoutMs],
  ];
  for (const [name, milliseconds] of settings) {
    await client.query("SELECT set_config($1, $2, false)", [name, `${milliseconds}ms`]);
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function acquireMigrationCoordinator(
  client,
  config,
  { now = Date.now, sleepFn = sleep } = {},
) {
  const startedAt = now();
  const deadline = startedAt + config.coordinationTimeoutMs;
  let attempts = 0;

  while (true) {
    attempts += 1;
    const { rows } = await client.query(
      "SELECT pg_try_advisory_lock($1::integer, $2::integer) AS acquired",
      MIGRATION_ADVISORY_LOCK_KEYS,
    );
    if (rows[0]?.acquired === true) {
      return { attempts, waitedMs: Math.max(0, now() - startedAt) };
    }

    const remaining = deadline - now();
    if (remaining <= 0) {
      throw new Error(
        `timed out after ${config.coordinationTimeoutMs}ms waiting for the AxTask migration coordinator lock`,
      );
    }
    await sleepFn(Math.min(config.coordinationRetryMs, remaining));
  }
}

export async function releaseMigrationCoordinator(client) {
  const { rows } = await client.query(
    "SELECT pg_advisory_unlock($1::integer, $2::integer) AS released",
    MIGRATION_ADVISORY_LOCK_KEYS,
  );
  if (rows[0]?.released !== true) {
    throw new Error("AxTask migration coordinator advisory lock was not held by this session");
  }
}
