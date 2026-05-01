import { createHmac } from "crypto";

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isClientInstanceIdWellFormed(value: string): boolean {
  return UUID_V4_RE.test(value.trim());
}

/** Non-reversible id for the security ledger (HMAC with session signing secret when set). */
export function hashClientInstanceIdForLedger(raw: string): string {
  const trimmed = raw.trim();
  const secret = (process.env.SESSION_SECRET || "").trim();
  if (secret.length >= 32) {
    return createHmac("sha256", secret).update(trimmed).digest("hex");
  }
  return createHmac("sha256", "axtask-dev-client-instance").update(trimmed).digest("hex");
}
