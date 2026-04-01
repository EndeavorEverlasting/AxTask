import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupAuth } from "./auth";
import { registerOAuthRoutes } from "./auth-providers";
import { seedDevAccounts } from "./seed-dev";
import { setupCollaborationWs } from "./collaboration";

const app = express();

app.set("trust proxy", 1);

const isDev = process.env.NODE_ENV !== "production";
const productionDomain = "axtask.replit.app";

app.use(
  helmet({
    contentSecurityPolicy: isDev ? false : {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
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
    const host = req.get("host") || "";
    if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
      return next();
    }
    if (req.get("x-forwarded-proto") !== "https" && req.protocol !== "https") {
      return res.redirect(301, `https://${productionDomain}${req.originalUrl}`);
    }
    if (host && host !== productionDomain && !host.endsWith(".replit.dev")) {
      return res.redirect(301, `https://${productionDomain}${req.originalUrl}`);
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

if (!isDev) {
  app.use("/api", (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      return next();
    }
    const origin = req.get("origin");
    const referer = req.get("referer");
    const allowed = [`https://${productionDomain}`];
    if (origin && !allowed.some((a) => origin.startsWith(a))) {
      return res.status(403).json({ message: "Forbidden — invalid origin" });
    }
    if (!origin && referer && !allowed.some((a) => referer.startsWith(a))) {
      return res.status(403).json({ message: "Forbidden — invalid referer" });
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

  app.get("/healthz", (_req, res) => {
    res.status(200).send("ok");
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || '5000', 10);
  console.log(`[startup] NODE_ENV=${process.env.NODE_ENV}, binding to port ${port}`);

  const killPortAndListen = async (targetPort: number, retries = 2): Promise<void> => {
    return new Promise((resolve, reject) => {
      const onError = async (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && retries > 0) {
          console.warn(`[startup] Port ${targetPort} in use — attempting to free it (${retries} retries left)`);
          try {
            const { execSync } = await import("child_process");
            try {
              const pids = execSync(`lsof -ti :${targetPort}`, { encoding: "utf8" }).trim();
              if (pids) {
                for (const pid of pids.split("\n")) {
                  const p = pid.trim();
                  if (p && p !== String(process.pid)) {
                    try { process.kill(Number(p), "SIGTERM"); } catch {}
                  }
                }
                await new Promise(r => setTimeout(r, 1000));
              }
            } catch {}
          } catch {}
          server.removeListener("error", onError);
          return killPortAndListen(targetPort, retries - 1).then(resolve, reject);
        }
        reject(err);
      };

      server.once("error", onError);
      server.listen(
        {
          port: targetPort,
          host: "0.0.0.0",
          ...(process.platform !== "win32" && { reusePort: true }),
        },
        () => {
          server.removeListener("error", onError);
          log(`serving on port ${targetPort}`);
          resolve();
        },
      );
    });
  };

  try {
    await killPortAndListen(port);
  } catch (err) {
    console.error(`[startup] Failed to bind port ${port}:`, err);
    process.exit(1);
  }
})();
