/**
 * Labels for UX and future multi-method UIs. RFC 6238 TOTP is shared by:
 * Google Authenticator, Microsoft Authenticator, AWS IAM virtual MFA, 1Password, etc.
 */
export const AUTHENTICATOR_KIND = {
  /** Standard TOTP (RFC 6238) — Google Authenticator, Microsoft Authenticator, … */
  TOTP_RFC6238: "totp_rfc6238",
  /** Same verifier as TOTP_RFC6238 — IAM “virtual MFA” is standard TOTP. */
  AWS_IAM_VIRTUAL_MFA_ALIAS: "totp_rfc6238",
  /** Steam Guard uses a proprietary algorithm — not supported; see authenticator-stubs. */
  STEAM_GUARD: "steam_guard_unsupported",
} as const;
