// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isDbIncidentAlert, notifyAdminsOfApiError } from "./admin-alerts";

describe("notifyAdminsOfApiError", () => {
  it("is a no-op when ADMIN_ALERT_MODE=off", async () => {
    const prev = process.env.ADMIN_ALERT_MODE;
    process.env.ADMIN_ALERT_MODE = "off";
    try {
      await expect(
        notifyAdminsOfApiError({
          route: "/api/foo",
          method: "GET",
          statusCode: 500,
          errorName: "Error",
          errorMessage: "boom",
          requestId: "rid",
        }),
      ).resolves.toBeUndefined();
    } finally {
      if (typeof prev === "string") process.env.ADMIN_ALERT_MODE = prev;
      else delete process.env.ADMIN_ALERT_MODE;
    }
  });

  it("recognizes DB incident alerts so recipient lookup can avoid the failing database", () => {
    expect(isDbIncidentAlert({ errorName: "DB_CONNECTION_FAILED" })).toBe(true);
    expect(isDbIncidentAlert({ errorName: "DB_TIMEOUT" })).toBe(true);
    expect(isDbIncidentAlert({ errorName: "TypeError" })).toBe(false);
  });
});

