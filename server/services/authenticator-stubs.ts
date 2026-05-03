/**
 * Steam Guard codes are not RFC 6238 TOTP. No implementation — placeholder for future work.
 */
export type SteamGuardVerifyResult =
  | { ok: false; reason: "not_implemented" }
  | { ok: false; reason: "unsupported_algorithm" };

export function verifySteamGuardCode(_code: string): SteamGuardVerifyResult {
  return { ok: false, reason: "not_implemented" };
}
