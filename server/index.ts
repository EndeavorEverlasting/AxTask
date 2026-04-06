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
import { setupCollaborationWs } from "./collaboration";
import { isLocalBrowserHostname } from "./lib/browser-origin";
import { createApiWriteOriginGuard } from "./lib/api-write-origin-guard";
import { parseCookieSecureFlag, parseForceHttps, parseNodeIsDev } from "./lib/login-env-policy";
import { AXTASK_CSRF_COOKIE, AXTASK_CSRF_HEADER } from "@shared/http-auth";
import { initVapidAtBoot } from "./services/vapid-runtime";
import { startWebPushDispatchScheduler } from "./services/web-push-dispatch";

const app = express();

app.set("trust proxy", 1);

const isDev = parseNodeIsDev(process.env);
const canonicalHost = (process.env.CANONICAL_HOST || "").trim().toLowerCase();
const replitFallbackHost = (process.env.REPLIT_FALLBACK_HOST || "axtask.replit.app").trim().toLowerCase();
const forceHttps = parseForceHttps(process.env);
const cookieSecure = parseCookieSecureFlag(process.env);

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

const extraAllowedHosts = parseCsvEnv(process.env.ADDITIONAL_ALLOWED_HOSTS);
const allowedHosts = new Set<string>(
  [canonicalHost, replitFallbackHost, ...extraAllowedHosts].filter(Boolean),
);

function isAllowedHost(hostHeader: string): boolean {
  const host = normalizeHost(hostHeader);
  if (isLocalBrowserHostname(host)) return true;
  if (host.endsWith(".replit.dev")) return true;
  return allowedHosts.has(host);
}

const allowedOrigins = new Set<string>(
  Array.from(allowedHosts).map((host) => `https://${host}`),
);
for (const origin of parseCsvEnv(process.env.ADDITIONAL_ALLOWED_ORIGINS)) {
  allowedOrigins.add(origin.startsWith("http") ? origin : `https://${origin}`);
}

const connectSrcDirectives = (() => {
  const s = new Set<string>([
    "'self'",
    "https://accounts.google.com",
    "https://oauth2.googleapis.com",
  ]);
  for (const host of allowedHosts) {
    if (!host) continue;
    s.add(`https://${host}`);
    s.add(`wss://${host}`);
  }
  for (const origin of allowedOrigins) {
    s.add(origin);
    try {
      s.add(`wss://${new URL(origin).hostname}`);
    } catch {
      /* ignore malformed ADDITIONAL_ALLOWED_ORIGINS entries */
    }
  }
  return Array.from(s);
})();

app.use(
  helmet({
    contentSecurityPolicy: isDev ? false : {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: connectSrcDirectives,
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

    if (forceHttps && req.protocol !== "https" && !isLocalBrowserHostname(host)) {
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
const largeJsonParser = express.json({ limit: "50mb" });
const defaultJsonParser = express.json({ limit: "2mb" });
app.use((req, res, next) => {
  if (LARGE_BODY_PATHS.includes(req.path)) {
    return largeJsonParser(req, res, next);
  }
  return defaultJsonParser(req, res, next);
});
app.use(express.urlencoded({ extended: false, limit: "2mb" }));

if (!isDev) {
  app.use("/api", createApiWriteOriginGuard(allowedOrigins, forceHttps));
}

import { randomBytes as csrfRandomBytes } from "crypto";

app.use("/api", (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    if (!req.cookies?.[AXTASK_CSRF_COOKIE]) {
      const token = csrfRandomBytes(32).toString("base64url");
      res.cookie(AXTASK_CSRF_COOKIE, token, {
        httpOnly: false,
        secure: cookieSecure,
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

  const cookieToken = req.cookies?.[AXTASK_CSRF_COOKIE];
  const headerToken = req.get(AXTASK_CSRF_HEADER);
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    const token = csrfRandomBytes(32).toString("base64url");
    res.cookie(AXTASK_CSRF_COOKIE, token, {
      httpOnly: false,
      secure: cookieSecure,
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
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

      const isSensitive = path.startsWith("/api/auth");
      if (capturedJsonResponse && !isSensitive) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await seedDevAccounts();
  await initVapidAtBoot();

  const server = await registerRoutes(app);

  setupCollaborationWs(server);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message =
      process.env.NODE_ENV === "production" && status >= 500
        ? "Internal Server Error"
        : err.message || "Internal Server Error";

    console.error(`[error] ${status} — ${err.message || err}`);
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
      startWebPushDispatchScheduler();
    },
  );
})();
