/**
 * Redacted one-shot summary of auth/security/push boot configuration for operators and log pipelines.
 * Never logs secret values — booleans, enums, and numeric session TTL only.
 */

import { getAvailableProviders, getProvider } from "./auth-providers";
import { getRegistrationConfig, inviteConfiguredForClient } from "./registration-config";
import { getSessionMaxAgeMs } from "./session-config";

function inviteStrengthLabel(): "ok" | "weak" | "missing" {
  const cfg = getRegistrationConfig();
  if (cfg.mode !== "invite") return "ok";
  if (!cfg.inviteCode) return "missing";
  if (cfg.inviteCodeWeak) return "weak";
  return "ok";
}

function totpEncryptionConfigured(): boolean {
  return Boolean(String(process.env.TOTP_ENCRYPTION_KEY ?? "").trim());
}

function vapidFullyConfigured(): boolean {
  const pub = Boolean(String(process.env.VAPID_PUBLIC_KEY ?? "").trim());
  const priv = Boolean(String(process.env.VAPID_PRIVATE_KEY ?? "").trim());
  return pub && priv;
}

function authProviderList(): string[] {
  const primary = getProvider();
  const names = new Set<string>([primary]);
  for (const p of getAvailableProviders()) names.add(p.name);
  return [...names].sort();
}

/** Emit human-readable boot lines and one structured JSON line (no secret values). Skips when NODE_ENV is `test`. */
export function logBootConfigSummary(): void {
  if (process.env.NODE_ENV === "test") return;

  const cfg = getRegistrationConfig();
  const registrationMode = cfg.mode;
  const inviteConfigured = inviteConfiguredForClient(cfg);
  const inviteStrength = inviteStrengthLabel();
  const authProviders = authProviderList();
  const sessionMaxAgeMs = getSessionMaxAgeMs();
  const secureCookies = process.env.NODE_ENV === "production";
  const totpOk = totpEncryptionConfigured();
  const vapidOk = vapidFullyConfigured();
  const nodeEnv = process.env.NODE_ENV ?? "";

  console.info(`[auth] registration mode: ${registrationMode}`);
  console.info(`[auth] invite code configured: ${inviteConfigured ? "yes" : "no"}`);
  console.info(`[auth] invite code strength: ${inviteStrength}`);
  console.info(`[auth] auth providers: ${authProviders.join(", ")}`);
  console.info(`[security] session max age: ${sessionMaxAgeMs} ms`);
  console.info(`[security] secure cookies: ${secureCookies ? "yes" : "no"}`);
  console.info(`[security] totp encryption key: ${totpOk ? "configured" : "not configured"}`);
  console.info(`[push] vapid push: ${vapidOk ? "configured" : "not configured"}`);

  console.log(
    JSON.stringify({
      event: "axtask.boot.config",
      registrationMode,
      inviteConfigured,
      inviteStrength,
      authProviders,
      sessionMaxAgeMs,
      secureCookies,
      totpEncryptionConfigured: totpOk,
      vapidConfigured: vapidOk,
      nodeEnv,
    }),
  );
}
