import type { Express, Request, Response, NextFunction } from "express";

/**
 * Collapse duplicate slashes and strip query/hash so scanner paths like
 * `//wordpress/wp-includes/...` match rules reliably.
 */
export function normalizeUrlPath(pathWithQuery: string): string {
  const path = pathWithQuery.split("?")[0].split("#")[0];
  const segments = path.split("/").filter((s) => s.length > 0);
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
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
      res.status(404).type("text/plain").send("Not found");
      return;
    }
    next();
  });
}
