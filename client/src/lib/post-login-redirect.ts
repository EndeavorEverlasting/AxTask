import { isValidAppPath } from "./app-routes";

/** OAuth / cross-origin flows: set before leaving to provider; read after session exists. */
export const POST_LOGIN_REDIRECT_STORAGE_KEY = "axtask_post_login_redirect";

/**
 * Returns a safe internal path for navigation after login, or null if unsafe / empty.
 * Rejects external URLs, protocol-relative paths, and traversal.
 */
export function getSafePostLoginPath(raw: string | null | undefined): string | null {
  if (raw == null || raw === "") return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw.trim());
  } catch {
    return null;
  }
  if (!decoded.startsWith("/")) return null;
  if (decoded.startsWith("//")) return null;
  if (decoded.includes("://")) return null;
  const pathOnly = decoded.split("?")[0]?.split("#")[0] ?? "";
  if (!pathOnly || pathOnly.includes("..")) return null;
  if (!isValidAppPath(pathOnly)) return null;
  if (pathOnly === "/") return "/";
  return pathOnly;
}

export function rememberPostLoginRedirectForOAuth(path: string): void {
  const safe = getSafePostLoginPath(path);
  if (!safe) return;
  try {
    sessionStorage.setItem(POST_LOGIN_REDIRECT_STORAGE_KEY, safe);
  } catch {
    /* ignore */
  }
}

export function consumePostLoginRedirectFromStorage(): string | null {
  try {
    const v = sessionStorage.getItem(POST_LOGIN_REDIRECT_STORAGE_KEY);
    sessionStorage.removeItem(POST_LOGIN_REDIRECT_STORAGE_KEY);
    return getSafePostLoginPath(v);
  } catch {
    return null;
  }
}
