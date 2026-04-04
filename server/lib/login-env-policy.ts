/**
 * Central rules for how local/offline (`npm run dev`, `offline:start`) and
 * Docker/local-prod (`NODE_ENV=production`, `FORCE_HTTPS=false`) relate to HTTPS
 * and browser cookie `Secure` flags. Keeps session + CSRF cookies usable on
 * http://localhost when TLS is not forced.
 */
export function parseForceHttps(env: NodeJS.ProcessEnv): boolean {
  return env.FORCE_HTTPS !== "false";
}

/** `Secure` on session + CSRF cookies: only when we expect HTTPS-only clients. */
export function parseCookieSecureFlag(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === "production" && parseForceHttps(env);
}

export function parseNodeIsDev(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV !== "production";
}
