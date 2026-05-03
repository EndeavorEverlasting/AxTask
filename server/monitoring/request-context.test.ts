// @vitest-environment node
import { describe, expect, it } from "vitest";
import { attachMonitorContext } from "./request-context";

describe("attachMonitorContext", () => {
  it("sets x-request-id and captures allowlisted params safely", () => {
    const mw = attachMonitorContext({
      allowlist: ["taskId", "email", "limit"],
      headerAllowlist: ["x-client-version"],
    });

    const req: any = {
      path: "/api/tasks/123",
      method: "POST",
      ip: "127.0.0.1",
      params: { taskId: "t_1", other: "nope" },
      query: { limit: "50", token: "secret" },
      body: { email: "user@example.com", password: "dont-store", nested: { a: 1 } },
      user: { id: "u_1" },
      get: (h: string) => {
        if (h.toLowerCase() === "x-request-id") return "rid_inbound";
        if (h.toLowerCase() === "x-client-version") return "1.2.3";
        if (h.toLowerCase() === "user-agent") return "UA";
        return undefined;
      },
    };

    const res: any = {
      headers: {} as Record<string, string>,
      setHeader: (k: string, v: string) => {
        res.headers[k.toLowerCase()] = v;
      },
    };

    mw(req, res, () => {});

    expect(res.headers["x-request-id"]).toBe("rid_inbound");
    expect(req.monitor?.requestId).toBe("rid_inbound");
    expect(req.monitor?.params).toEqual({ taskId: "t_1" });
    expect(req.monitor?.query).toEqual({ limit: "50" });
    expect(req.monitor?.body).toEqual({ email: "user@example.com" });
    expect(req.monitor?.headers).toEqual({ "x-client-version": "1.2.3" });
  });

  it("generates a request id when missing", () => {
    const mw = attachMonitorContext({ allowlist: ["taskId"] });
    const req: any = {
      path: "/api/foo",
      method: "GET",
      ip: "127.0.0.1",
      params: {},
      query: {},
      body: {},
      get: (_h: string) => undefined,
    };
    const res: any = { setHeader: (_k: string, _v: string) => {} };
    mw(req, res, () => {});
    expect(typeof req.monitor?.requestId).toBe("string");
    expect((req.monitor?.requestId || "").length).toBeGreaterThan(10);
  });
});

