import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupAuth } from "./auth";
import { registerOAuthRoutes } from "./auth-providers";
import { seedDevAccounts } from "./seed-dev";
import { pool } from "./db";
import { installProbeSink } from "./probe-sink";
import { setupCollaborationWs } from "./collaboration";
import { attachMonitorContext } from "./monitoring/request-context";
import { appendSecurityEvent } from "./storage";
import { notifyAdminsOfApiError } from "./monitoring/admin-alerts";
import { evaluateAdherenceForAllUsers } from "./services/adherence-evaluator";
import { dispatchAdherencePushNotifications } from "./services/adherence-dispatch";
import { getAdherenceThresholds, isAdherenceEnabled } from "./services/adherence-thresholds";

const app = express();

app.set("trust proxy", 1);
installProbeSink(app);

const isDev = process.env.NODE_ENV !== "production";
const canonicalHost = (process.env.CANONICAL_HOST || "").trim().toLowerCase();
const replitFallbackHost = (process.env.REPLIT_FALLBACK_HOST || "axtask.replit.app").trim().toLowerCase();
const forceHttps = process.env.FORCE_HTTPS !== "false";

function parseCsvEnv(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeHost(hostHeader: string): string {
  return hostHeader.split(":")[0].trim().toLowerCase();
}

function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1";
}

// Production custom domain (e.g. axtask.app): set CANONICAL_HOST and/or ADDITIONAL_ALLOWED_HOSTS so host checks pass behind the proxy.
const extraAllowedHosts = parseCsvEnv(process.env.ADDITIONAL_ALLOWED_HOSTS);
const allowedHosts = new Set<string>(
  [canonicalHost, replitFallbackHost, ...extraAllowedHosts].filter(Boolean),
);

function isAllowedHost(hostHeader: string): boolean {
  const host = normalizeHost(hostHeader);
  if (isLocalHost(host)) return true;
  if (host.endsWith(".replit.dev")) return true;
  return allowedHosts.has(host);
}

const allowedOrigins = new Set<string>(
  Array.from(allowedHosts).map((host) => `https://${host}`),
);
for (const origin of parseCsvEnv(process.env.ADDITIONAL_ALLOWED_ORIGINS)) {
  allowedOrigins.add(origin.startsWith("http") ? origin : `https://${origin}`);
}

app.use(
  helmet({
    contentSecurityPolicy: isDev ? false : {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://replit.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "wss:", "ws:", "https://accounts.google.com", "https://oauth2.googleapis.com"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'", "https://accounts.google.com"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: isDev ? false : undefined,
    hsts: isDev ? false : {
      maxAge: 63072000,
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    noSniff: true,
    hidePoweredBy: true,
    frameguard: { action: "deny" },
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
  })
);

if (!isDev) {
  app.use((req, res, next) => {
    const hostHeader = req.get("host") || "";
    const host = normalizeHost(hostHeader);

    if (forceHttps && req.protocol !== "https" && !isLocalHost(host)) {
      const httpsHost = hostHeader || canonicalHost || replitFallbackHost;
      return res.redirect(301, `https://${httpsHost}${req.originalUrl}`);
    }

    if (hostHeader && !isAllowedHost(hostHeader)) {
      if (canonicalHost) {
        return res.redirect(301, `https://${canonicalHost}${req.originalUrl}`);
      }
      return res.status(403).json({ message: "Forbidden host" });
    }

    next();
  });
}

app.use(cookieParser());
const LARGE_BODY_PATHS = ["/api/admin/import", "/api/account/import", "/api/admin/import/validate"];
app.use((req, res, next) => {
  if (LARGE_BODY_PATHS.some(p => req.path.startsWith(p))) {
    return express.json({ limit: "50mb" })(req, res, next);
  }
  return express.json({ limit: "2mb" })(req, res, next);
});
app.use(express.urlencoded({ extended: false, limit: "2mb" }));

// Attach a privacy-safe snapshot of allowlisted request parameters for monitoring.
// Must run after body parsers so req.body is available.
app.use("/api", attachMonitorContext());

if (!isDev) {
  app.use((_, res, next) => {
    res.setHeader(
      "Content-Security-Policy-Report-Only",
      "default-src 'self'; script-src 'self' https://replit.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com; object-src 'none'; base-uri 'self'; frame-src 'none'; form-action 'self' https://accounts.google.com; report-uri /csp-report",
    );
    next();
  });
}

app.post(
  "/csp-report",
  express.json({ type: ["application/csp-report", "application/reports+json", "application/json"] }),
  (req, res) => {
    const report = (req.body && (req.body["csp-report"] || req.body)) as
      | Record<string, unknown>
      | undefined;
    if (report) {
      const blockedUri = String(report["blocked-uri"] || "");
      const violated = String(report["violated-directive"] || "");
      const sourceFile = String(report["source-file"] || "");
      log(`[csp-report] violated="${violated}" blocked="${blockedUri}" source="${sourceFile}"`);
    }
    res.status(204).send();
  },
);

if (!isDev) {
  app.use("/api", (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      return next();
    }
    const origin = req.get("origin");
    const referer = req.get("referer");
    if (origin && !allowedOrigins.has(origin.toLowerCase())) {
      return res.status(403).json({ message: "Forbidden — invalid origin" });
    }
    if (!origin && referer) {
      try {
        const refererOrigin = new URL(referer).origin.toLowerCase();
        if (!allowedOrigins.has(refererOrigin)) {
          return res.status(403).json({ message: "Forbidden — invalid referer" });
        }
      } catch {
        return res.status(403).json({ message: "Forbidden — invalid referer" });
      }
    }
    next();
  });
}

import { randomBytes as csrfRandomBytes } from "crypto";

const CSRF_COOKIE = "axtask.csrf";
const CSRF_HEADER = "x-csrf-token";

app.use("/api", (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    if (!req.cookies?.[CSRF_COOKIE]) {
      const token = csrfRandomBytes(32).toString("base64url");
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: false,
        secure: !isDev,
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }
    return next();
  }

  if (req.path.startsWith("/auth/callback") || req.path.startsWith("/auth/google/callback") || req.path.startsWith("/auth/replit/callback")) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    const token = csrfRandomBytes(32).toString("base64url");
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: !isDev,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.status(403).json({ message: "Invalid CSRF token" });
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "axtask",
    timestamp: new Date().toISOString(),
  });
});

app.get("/ready", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "ready",
      service: "axtask",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "not_ready",
      service: "axtask",
      timestamp: new Date().toISOString(),
      message: "Database not reachable",
    });
  }
});

setupAuth(app);

registerOAuthRoutes(app);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

      // Never append response bodies to access logs: they may contain PII and land in log aggregators.
      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    await seedDevAccounts();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      `[seed] Dev account seed failed (${msg}). Start PostgreSQL and ensure DATABASE_URL is correct, or set DISABLE_DEV_SEED=true to skip seeding. The server will continue; auth DB calls will still fail until the database is reachable.`,
    );
  }

  const server = await registerRoutes(app);

  setupCollaborationWs(server);

  if (isAdherenceEnabled()) {
    const thresholds = getAdherenceThresholds();
    const runAdherenceTick = async () => {
      try {
        await evaluateAdherenceForAllUsers("cron");
        await dispatchAdherencePushNotifications(100);
      } catch (error) {
        console.warn("[adherence] background tick failed:", (error as Error)?.message || String(error));
      }
    };
    void runAdherenceTick();
    setInterval(() => {
      void runAdherenceTick();
    }, thresholds.cronIntervalMs);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const req = _req as Request & { monitor?: { requestId?: string; params?: any; query?: any; body?: any; headers?: any } };
    const status = err.status || err.statusCode || 500;
    const message =
      process.env.NODE_ENV === "production" && status >= 500
        ? "Internal Server Error"
        : err.message || "Internal Server Error";

    console.error(`[error] ${status} — ${err.message || err}`);

    // Best-effort audit event for server-side errors (never blocks response).
    try {
      (req as any).__axtaskApiErrorEmitted = true;
      const ctx = req.monitor;
      const errorName = err?.name ? String(err.name) : "Error";
      const errorMessage = err?.message ? String(err.message) : String(err);
      void appendSecurityEvent({
        eventType: "api_error",
        actorUserId: (req.user as any)?.id,
        route: req.path,
        method: req.method,
        statusCode: status,
        ipAddress: req.ip,
        userAgent: req.get("user-agent") || undefined,
        payload: {
          requestId: ctx?.requestId,
          params: ctx?.params,
          query: ctx?.query,
          body: ctx?.body,
          headers: ctx?.headers,
          errorName,
          errorMessage,
          ...(process.env.NODE_ENV !== "production" ? { stack: err?.stack ? String(err.stack) : undefined } : {}),
        },
      });
      void notifyAdminsOfApiError({
        requestId: ctx?.requestId,
        route: req.path,
        method: req.method,
        statusCode: status,
        errorName,
        errorMessage,
      });
    } catch {
      // ignore
    }
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      ...(process.platform !== "win32" && { reusePort: true }),
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
