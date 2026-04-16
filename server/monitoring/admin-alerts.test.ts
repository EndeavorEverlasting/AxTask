// @vitest-environment node
import { describe, expect, it } from "vitest";
import { notifyAdminsOfApiError } from "./admin-alerts";

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
});

