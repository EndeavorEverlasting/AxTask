import type { NextFunction, Request, RequestHandler, Response } from "express";
import { isBrowserOriginAllowed } from "./browser-origin";

/**
 * Rejects mutating /api requests whose Origin/Referer do not match deployment policy.
 * Extracted for unit tests (Docker http://localhost:5000 vs production https).
 */
export function createApiWriteOriginGuard(
  allowedOrigins: ReadonlySet<string>,
  forceHttps: boolean,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      return next();
    }
    const origin = req.get("origin");
    const referer = req.get("referer");
    if (origin && !isBrowserOriginAllowed(origin, allowedOrigins, forceHttps)) {
      return res.status(403).json({ message: "Forbidden — invalid origin" });
    }
    if (!origin && referer) {
      try {
        const refererOrigin = new URL(referer).origin;
        if (!isBrowserOriginAllowed(refererOrigin, allowedOrigins, forceHttps)) {
          return res.status(403).json({ message: "Forbidden — invalid referer" });
        }
      } catch {
        return res.status(403).json({ message: "Forbidden — invalid referer" });
      }
    }
    next();
  };
}
