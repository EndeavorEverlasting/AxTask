import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

export type MonitorContext = {
  requestId: string;
  route: string;
  method: string;
  ipAddress: string | undefined;
  userAgent: string | undefined;
  actorUserId: string | undefined;
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  headers: Record<string, unknown>;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      monitor?: MonitorContext;
    }
  }
}

const DEFAULT_ALLOWLIST = new Set<string>([
  "id",
  "taskId",
  "userId",
  "email",
  "challengeId",
  "purpose",
  "provider",
  "plan",
  "sku",
  "status",
  "page",
  "limit",
  "offset",
  "sort",
  "direction",
  "q",
  "query",
  "search",
  "clientVersion",
  "appVersion",
  "platform",
  "locale",
  "timezone",
]);

const DEFAULT_DENYLIST_SUBSTRINGS = [
  "password",
  "pass",
  "secret",
  "token",
  "authorization",
  "cookie",
  "session",
  "bearer",
  "otp",
  "totp",
  "code",
  "notes",
  "note",
  "message",
  "content",
  "html",
  "text",
  "body",
];

function normalizeKey(key: string): string {
  return key.trim();
}

function shouldRedactKey(key: string): boolean {
  const k = key.toLowerCase();
  return DEFAULT_DENYLIST_SUBSTRINGS.some((s) => k.includes(s));
}

function safePrimitive(value: unknown): string | number | boolean | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "boolean") return value;
  return String(value);
}

function truncateString(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen)}…`;
}

function sanitizeValue(value: unknown, maxLen: number): unknown {
  if (typeof value === "string") return truncateString(value, maxLen);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((v) => sanitizeValue(v, maxLen));
  }
  if (value && typeof value === "object") {
    // Never persist nested structures from request payloads by default.
    return "[object]";
  }
  return safePrimitive(value);
}

function sanitizeRecord(
  input: unknown,
  opts: { allowlist?: Set<string>; maxEntries: number; maxValueLen: number },
): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, unknown> = {};
  const entries = Object.entries(input as Record<string, unknown>);
  for (const [rawKey, rawValue] of entries) {
    if (Object.keys(out).length >= opts.maxEntries) break;
    const key = normalizeKey(rawKey);
    if (!key) continue;
    if (shouldRedactKey(key)) continue;
    if (opts.allowlist && !opts.allowlist.has(key)) continue;
    out[key] = sanitizeValue(rawValue, opts.maxValueLen);
  }
  return out;
}

export function resolveRequestId(req: Request): string {
  const inbound = (req.get("x-request-id") || "").trim();
  if (inbound && inbound.length <= 128) return inbound;
  return randomUUID();
}

export function attachMonitorContext(options?: {
  allowlist?: string[];
  headerAllowlist?: string[];
}): (req: Request, res: Response, next: NextFunction) => void {
  const allowlist = options?.allowlist ? new Set(options.allowlist) : DEFAULT_ALLOWLIST;
  const headerAllowlist = new Set(
    (options?.headerAllowlist && options.headerAllowlist.length > 0)
      ? options.headerAllowlist
      : ["x-client-version", "x-app-version", "x-platform", "x-locale", "x-timezone"],
  );

  return (req, res, next) => {
    const requestId = resolveRequestId(req);
    res.setHeader("x-request-id", requestId);

    const headers: Record<string, unknown> = {};
    for (const key of headerAllowlist) {
      const v = req.get(key);
      if (v) headers[key] = truncateString(v, 120);
    }

    req.monitor = {
      requestId,
      route: req.path,
      method: req.method,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || undefined,
      actorUserId: (req.user as any)?.id,
      params: sanitizeRecord(req.params, { allowlist, maxEntries: 40, maxValueLen: 120 }),
      query: sanitizeRecord(req.query, { allowlist, maxEntries: 40, maxValueLen: 120 }),
      body: sanitizeRecord(req.body, { allowlist, maxEntries: 40, maxValueLen: 160 }),
      headers,
    };
    next();
  };
}

