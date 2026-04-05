/** OAuth redirect query values from server when an IdP is not configured ([auth-providers.ts]). */
export const SSO_NOT_CONFIGURED_ERROR_CODES = [
  "google_not_configured",
  "workos_not_configured",
  "replit_not_configured",
] as const;

export type SsoNotConfiguredErrorCode = (typeof SSO_NOT_CONFIGURED_ERROR_CODES)[number];

const SSO_NOT_CONFIGURED_SET = new Set<string>(SSO_NOT_CONFIGURED_ERROR_CODES);

/** User-facing copy for OAuth redirect errors (keep in sync with login page). */
export const SSO_NOT_CONFIGURED_USER_MESSAGES: Record<SsoNotConfiguredErrorCode, string> = {
  google_not_configured: "Google sign-in is not available. Please use another sign-in method.",
  workos_not_configured: "WorkOS sign-in is not available. Please use another sign-in method.",
  replit_not_configured: "Replit sign-in is not available. Please use another sign-in method.",
};

export const SSO_NOT_CONFIGURED_EXACT_MESSAGES = new Set(
  Object.values(SSO_NOT_CONFIGURED_USER_MESSAGES),
);

export function isSsoNotConfiguredErrorCode(code: string | null | undefined): boolean {
  return !!code && SSO_NOT_CONFIGURED_SET.has(code);
}

/**
 * SSO-down banner: only when SSO is offered and failure clearly indicates IdP/config unavailability.
 */
export function shouldShowSsoDownBanner(input: {
  oauthProviderCount: number;
  oauthCallbackErrorCode: string | null;
  errorMessage: string;
}): boolean {
  if (input.oauthProviderCount <= 0) return false;
  if (isSsoNotConfiguredErrorCode(input.oauthCallbackErrorCode)) return true;
  if (input.errorMessage && SSO_NOT_CONFIGURED_EXACT_MESSAGES.has(input.errorMessage)) return true;
  return false;
}
