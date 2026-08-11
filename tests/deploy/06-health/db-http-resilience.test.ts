// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Express, Request, Response, NextFunction } from "express";
import { installDb5xxFallback } from "../../../server/db-http-resilience";

function setup(probeResult: any) {
  let middleware: ((req: Request, res: Response, next: NextFunction) => void) | undefined;
  const app = {
    use: vi.fn((_path: string, fn: typeof middleware) => {
      middleware = fn;
    }),
  } as unknown as Express;
  const log = vi.fn();
  const probe = vi.fn().mockResolvedValue(probeResult);

  installDb5xxFallback(app, {
    probe,
    getAppPoolSnapshot: () => ({ totalCount: 4, idleCount: 0, waitingCount: 2 }),
    log,
  });

  const json = vi.fn();
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 500,
    headersSent: false,
    json,
    status: vi.fn(function (this: any, status: number) {
      this.statusCode = status;
      return this;
    }),
    setHeader: vi.fn((key: string, value: string) => {
      headers[key] = value;
    }),
  } as unknown as Response;
  const req = {
    path: "/api/tasks",
    method: "GET",
    monitor: { requestId: "rid-fallback" },
  } as unknown as Request;

  middleware?.(req, res, vi.fn());
  return { req: req as any, res: res as any, json, probe, log, headers };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("DB-confirmed 5xx response fallback", () => {
  const priorAlertMode = process.env.ADMIN_ALERT_MODE;

  afterEach(() => {
    if (typeof priorAlertMode === "string") process.env.ADMIN_ALERT_MODE = priorAlertMode;
    else delete process.env.ADMIN_ALERT_MODE;
  });

  it("preserves an ordinary route 500 when the database is reachable", async () => {
    process.env.ADMIN_ALERT_MODE = "off";
    const ctx = setup({
      reachable: true,
      latencyMs: 4,
      pool: { totalCount: 1, idleCount: 1, waitingCount: 0 },
    });

    ctx.res.json({ message: "Failed to fetch tasks" });
    await flush();

    expect(ctx.probe).toHaveBeenCalledTimes(1);
    expect(ctx.res.statusCode).toBe(500);
    expect(ctx.json).toHaveBeenCalledWith({ message: "Failed to fetch tasks" });
    expect(ctx.req.__axtaskApiErrorEmitted).not.toBe(true);
  });

  it("reclassifies a swallowed route 500 only when readiness confirms DB unavailability", async () => {
    process.env.ADMIN_ALERT_MODE = "off";
    const ctx = setup({
      reachable: false,
      latencyMs: 12,
      errorClass: "DB_CONNECTION_FAILED",
      retryable: true,
      code: "57P03",
      pool: { totalCount: 1, idleCount: 0, waitingCount: 0 },
    });

    ctx.res.json({ message: "Failed to fetch tasks" });
    await flush();

    expect(ctx.res.status).toHaveBeenCalledWith(503);
    expect(ctx.headers["Retry-After"]).toBe("2");
    expect(ctx.req.__axtaskApiErrorEmitted).toBe(true);
    expect(ctx.json).toHaveBeenCalledWith({
      message: "Service temporarily unavailable",
      errorClass: "DB_CONNECTION_FAILED",
      retryable: true,
      requestId: "rid-fallback",
    });
    expect(ctx.log).toHaveBeenCalledWith(expect.objectContaining({
      event: "db_fallback_5xx_reclassified",
      originalStatus: 500,
    }));
  });

  it("does not intercept an error already classified by the central middleware", async () => {
    process.env.ADMIN_ALERT_MODE = "off";
    const ctx = setup({ reachable: false });
    ctx.req.__axtaskApiErrorEmitted = true;

    ctx.res.json({ message: "already handled" });
    await flush();

    expect(ctx.probe).not.toHaveBeenCalled();
    expect(ctx.json).toHaveBeenCalledWith({ message: "already handled" });
  });
});
