/**
 * Normalized registration gate (REGISTRATION_MODE / INVITE_CODE).
 * Centralized registration gate for invite-only defaults and env typo handling.
 */

export type RegistrationMode = "open" | "invite" | "closed";

export interface RegistrationConfig {
  mode: RegistrationMode;
  /** Trimmed server-side invite code; empty if unset. */
  inviteCode: string;
  /** True when invite mode is on and code is non-empty but shorter than 8 chars. */
  inviteCodeWeak: boolean;
  /** True when REGISTRATION_MODE was set but not one of open|invite|closed. */
  rawModeWasUnknown: boolean;
  /** Raw REGISTRATION_MODE string before normalization (for logs only). */
  rawRegistrationModeEnv: string;
}

const ALLOWED = new Set<RegistrationMode>(["open", "invite", "closed"]);

let cached: RegistrationConfig | null = null;

export function parseRegistrationConfig(env: NodeJS.ProcessEnv): RegistrationConfig {
  const rawRegistrationModeEnv = String(env.REGISTRATION_MODE ?? "").trim();
  const normalizedToken = rawRegistrationModeEnv.toLowerCase();

  let mode: RegistrationMode;
  let rawModeWasUnknown = false;

  if (normalizedToken && ALLOWED.has(normalizedToken as RegistrationMode)) {
    mode = normalizedToken as RegistrationMode;
  } else if (normalizedToken) {
    rawModeWasUnknown = true;
    mode = env.NODE_ENV === "production" ? "invite" : "open";
  } else {
    mode = env.NODE_ENV === "production" ? "invite" : "open";
  }

  const inviteCode = String(env.INVITE_CODE ?? "").trim();
  const inviteCodeWeak = mode === "invite" && inviteCode.length > 0 && inviteCode.length < 8;

  return {
    mode,
    inviteCode,
    inviteCodeWeak,
    rawModeWasUnknown,
    rawRegistrationModeEnv,
  };
}

export function getRegistrationConfig(): RegistrationConfig {
  if (!cached) {
    cached = parseRegistrationConfig(process.env);
  }
  return cached;
}

/** Test-only: clear memoized config so a new process.env snapshot is read. */
export function __resetRegistrationConfigCacheForTests(): void {
  cached = null;
}

export function inviteConfiguredForClient(config: RegistrationConfig): boolean {
  return config.mode !== "invite" || Boolean(config.inviteCode);
}
