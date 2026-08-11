import type { Express, Request, Response, NextFunction } from "express";
import type { DbPoolSnapshot, DbReadinessResult } from "./db-runtime";
import { notifyAdminsOfApiError } from "./monitoring/admin-alerts";

export type DbFallbackRequest = Request & {
  monitor?: { requestId?: string };
  __axtaskApiErrorEmitted?: boolean;
};

type InstallDb5xxFallbackOptions = {
  probe: () => Promise<DbReadinessResult>;
  getAppPoolSnapshot: () => DbPoolSnapshot;
  log?: (payload: Record<string, unknown>) => void;
};

/**
 * Some legacy route handlers catch their original exception and emit a generic
 * HTTP 500, which means the central error middleware never sees the DB error.
 * This response-boundary fallback checks DB readiness only for otherwise
 * unclassified 5xx JSON responses. If the DB is healthy, the original 5xx is
 * preserved. If the DB is unavailable, the response is converted to the same
 * safe structured 503 used by the central classifier.
 */
export function installDb5xxFallback(
  app: Express,
  options: InstallDb5xxFallbackOptions,
): void {
  app.use("/api", (rawReq: Request, res: Response, next: NextFunction) => {
    const req = rawReq as DbFallbackRequest;
    const originalJson = res.json.bind(res);
    let intercepting = false;

    res.json = ((body: unknown) => {
      if (
        intercepting ||
        res.headersSent ||
        res.statusCode < 500 ||
        req.__axtaskApiErrorEmitted
      ) {
        return originalJson(body);
      }

      intercepting = true;
      void options.probe().then((readiness) => {
        if (readiness.reachable || res.headersSent) {
          originalJson(body);
          return;
        }

        req.__axtaskApiErrorEmitted = true;
        const errorClass = readiness.errorClass || "DB_UNKNOWN";
        const retryable = readiness.retryable === true;
        const requestId = req.monitor?.requestId;
        const event = {
          event: "db_fallback_5xx_reclassified",
          requestId,
          route: req.path,
          method: req.method,
          originalStatus: res.statusCode,
          errorClass,
          retryable,
          code: readiness.code,
          appPool: options.getAppPoolSnapshot(),
        };
        options.log?.(event);

        void notifyAdminsOfApiError({
          requestId,
          route: req.path,
          method: req.method,
          statusCode: 503,
          errorName: errorClass,
          errorMessage: "Database unavailable while route returned 5xx",
        }).catch(() => {});

        if (retryable) res.setHeader("Retry-After", "2");
        res.status(503);
        originalJson({
          message: "Service temporarily unavailable",
          errorClass,
          retryable,
          requestId,
        });
      }).catch(() => {
        if (!res.headersSent) originalJson(body);
      });

      return res;
    }) as Response["json"];

    next();
  });
}
