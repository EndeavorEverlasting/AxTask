export function isLocalBrowserHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1";
}

/**
 * Validates Origin / Referer origin for mutating API requests in production.
 * Browsers send e.g. http://localhost:5000 while the allowlist may only list https://host (no port).
 */
export function isBrowserOriginAllowed(
  originHeader: string,
  allowedOrigins: ReadonlySet<string>,
  forceHttps: boolean,
): boolean {
  const lower = originHeader.toLowerCase();
  if (allowedOrigins.has(lower)) return true;
  try {
    const u = new URL(originHeader);
    const host = u.hostname.toLowerCase();
    if (!isLocalBrowserHostname(host)) return false;
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:" && !forceHttps) return true;
    return false;
  } catch {
    return false;
  }
}
