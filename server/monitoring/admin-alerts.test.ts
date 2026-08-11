// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
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

  it("ignores ordinary 4xx errors before any alert work", async () => {
    const previousMode = process.env.ADMIN_ALERT_MODE;
    const previousWebhook = process.env.ADMIN_ALERT_WEBHOOK_URL;
    process.env.ADMIN_ALERT_MODE = "always";
    process.env.ADMIN_ALERT_WEBHOOK_URL = "https://example.invalid/webhook";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      await expect(
        notifyAdminsOfApiError({
          route: "/api/auth/register",
          method: "POST",
          statusCode: 400,
          errorName: "ValidationError",
          errorMessage: "bad input",
        }),
      ).resolves.toBeUndefined();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      if (typeof previousMode === "string") process.env.ADMIN_ALERT_MODE = previousMode;
      else delete process.env.ADMIN_ALERT_MODE;
      if (typeof previousWebhook === "string") process.env.ADMIN_ALERT_WEBHOOK_URL = previousWebhook;
      else delete process.env.ADMIN_ALERT_WEBHOOK_URL;
    }
  });

  it("recognizes DB incident alerts so recipient lookup can avoid the failing database", () => {
    expect(isDbIncidentAlert({ errorName: "DB_CONNECTION_FAILED" })).toBe(true);
    expect(isDbIncidentAlert({ errorName: "DB_TIMEOUT" })).toBe(true);
    expect(isDbIncidentAlert({ errorName: "TypeError" })).toBe(false);
  });
});
