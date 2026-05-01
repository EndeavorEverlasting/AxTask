/** User-facing strings for auth providers (avoid vendor jargon like "WorkOS" in UI). */

export function providerShortLabel(provider: string): string {
  switch (provider) {
    case "google":
      return "Google";
    case "workos":
      return "Work account";
    case "replit":
      return "Replit";
    case "local":
    default:
      return "Email and password";
  }
}

/** Primary CTA line for OAuth provider buttons (full width). */
export function oauthPrimaryButtonLabel(provider: string): string {
  switch (provider) {
    case "google":
      return "Continue with Google";
    case "workos":
      return "Continue with work account";
    case "replit":
      return "Sign in with Replit";
    default:
      return `Continue with ${provider}`;
  }
}

/** Compact chip / grid label (known-account row, small buttons). */
export function oauthCompactLabel(provider: string): string {
  return providerShortLabel(provider);
}

/** Maps API provider name to tutorial / list copy. */
export function humanizeProviderForHelp(name: string): string {
  const key = name.toLowerCase();
  if (key === "google" || key === "workos" || key === "replit" || key === "local") {
    return providerShortLabel(key);
  }
  return name.charAt(0).toUpperCase() + name.slice(1);
}
