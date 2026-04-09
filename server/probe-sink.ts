import type { Express, Request, Response, NextFunction } from "express";
import { log } from "./vite";

/**
 * Collapse duplicate slashes and strip query/hash so scanner paths like
 * `//wordpress/wp-includes/...` match rules reliably.
 */
export function normalizeUrlPath(pathWithQuery: string): string {
  const path = pathWithQuery.split("?")[0].split("#")[0];
  const segments = path.split("/").filter((s) => s.length > 0);
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

/** Stable label for logs / metrics; only defined when {@link isScannerProbePath} is true. */
export function classifyScannerProbeFamily(normalizedPath: string): string {
  const path = normalizedPath.toLowerCase();
  if (path.includes("wlwmanifest.xml")) return "wordpress_wlwmanifest";
  if (path === "/wp-admin" || path.startsWith("/wp-admin/")) return "wordpress_wp_admin";
  if (path.startsWith("/wordpress/")) return "wordpress_prefix";
  if (path.includes("/wp-includes/")) return "wordpress_wp_includes";
  if (path.startsWith("/wp-content/")) return "wordpress_wp_content";
  if (path === "/xmlrpc.php" || path.endsWith("/xmlrpc.php")) return "wordpress_xmlrpc";
  if (path === "/wp-login.php" || path.endsWith("/wp-login.php")) return "wordpress_wp_login";
  return "wordpress_other";
}

function truncHeader(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined;
  const t = value.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/**
 * Cheap rejection for WordPress/CMS probes. Does not match legitimate AxTask routes.
 */
export function isScannerProbePath(normalizedPath: string): boolean {
  const path = normalizedPath.toLowerCase();
  if (path.includes("wlwmanifest.xml")) return true;
  if (path === "/wp-admin" || path.startsWith("/wp-admin/")) return true;
  if (path.startsWith("/wordpress/")) return true;
  if (path.includes("/wp-includes/")) return true;
  if (path.startsWith("/wp-content/")) return true;
  if (path === "/xmlrpc.php" || path.endsWith("/xmlrpc.php")) return true;
  if (path === "/wp-login.php" || path.endsWith("/wp-login.php")) return true;
  return false;
}

export function installProbeSink(app: Express): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const raw = req.originalUrl || req.url || "/";
    const normalized = normalizeUrlPath(raw);
    if (isScannerProbePath(normalized)) {
      const payload = {
        event: "scanner_probe",
        probeFamily: classifyScannerProbeFamily(normalized),
        method: req.method,
        path: normalized,
        url: truncHeader(raw, 500),
        ip: req.ip,
        xff: truncHeader(req.get("x-forwarded-for"), 200),
        ua: truncHeader(req.get("user-agent"), 300),
        referer: truncHeader(req.get("referer"), 200),
      };
      log(JSON.stringify(payload), "probe");
      res.status(404).type("text/plain").send("Not found");
      return;
    }
    next();
  });
}
