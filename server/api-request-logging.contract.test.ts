// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Low-noise audit discipline regression guard.
 *
 * Storing one `api_request` security event per normal `/api/*` response is
 * unbounded low-value telemetry that pressured the database during the
 * Neon/Node memory incident. This contract ensures the per-request write
 * stays behind the explicit `SECURITY_API_REQUEST_LOGGING` opt-in and can
 * never silently regress to unconditional logging — while the meaningful
 * 5xx `api_error` audit + admin notification remain always-on.
 *
 * We static-analyze server/routes.ts the same way the other
 * *.contract.test.ts files do (the /api middleware needs a live Express +
 * session stack to exercise directly).
 */
const routesSrc = fs.readFileSync(
  path.resolve(__dirname, "routes.ts"),
  "utf8",
);

describe("api_request security-event telemetry gate", () => {
  it("defines the SECURITY_API_REQUEST_LOGGING opt-in flag", () => {
    expect(routesSrc).toMatch(
      /const\s+SECURITY_API_REQUEST_LOGGING\s*=\s*\n?\s*process\.env\.SECURITY_API_REQUEST_LOGGING\s*===\s*"true"/,
    );
  });

  it("gates the api_request append behind the opt-in flag", () => {
    const flagIdx = routesSrc.indexOf("if (SECURITY_API_REQUEST_LOGGING)");
    expect(flagIdx, "missing SECURITY_API_REQUEST_LOGGING guard").toBeGreaterThan(-1);

    // The api_request append must live inside the guarded block, i.e. after
    // the `if (SECURITY_API_REQUEST_LOGGING)` opener.
    const apiRequestIdx = routesSrc.indexOf('eventType: "api_request"');
    expect(apiRequestIdx, "api_request append not found").toBeGreaterThan(-1);
    expect(apiRequestIdx).toBeGreaterThan(flagIdx);
  });

  it("contains no unconditional api_request append (the guard precedes it)", () => {
    // There must be exactly one api_request append, and the closest preceding
    // control structure must be the opt-in guard rather than the bare
    // res.on("finish") try block.
    const matches = routesSrc.match(/eventType:\s*"api_request"/g) ?? [];
    expect(matches.length).toBe(1);

    const apiRequestIdx = routesSrc.indexOf('eventType: "api_request"');
    const preceding = routesSrc.slice(0, apiRequestIdx);
    const lastGuard = preceding.lastIndexOf("if (SECURITY_API_REQUEST_LOGGING)");
    const lastFinish = preceding.lastIndexOf('res.on("finish"');
    expect(lastGuard).toBeGreaterThan(lastFinish);
  });

  it("keeps the 5xx api_error fallback independent of the api_request flag", () => {
    const errorIdx = routesSrc.indexOf('eventType: "api_error"');
    expect(errorIdx, "api_error append not found").toBeGreaterThan(-1);

    // The api_error block must be guarded by the 5xx status check, not by the
    // SECURITY_API_REQUEST_LOGGING opt-in.
    const preceding = routesSrc.slice(0, errorIdx);
    const lastStatusGuard = preceding.lastIndexOf("res.statusCode >= 500");
    const lastFlagGuard = preceding.lastIndexOf("if (SECURITY_API_REQUEST_LOGGING)");
    expect(lastStatusGuard).toBeGreaterThan(lastFlagGuard);
  });

  it("preserves admin notification for 5xx errors", () => {
    expect(routesSrc).toContain("notifyAdminsOfApiError");
  });
});
