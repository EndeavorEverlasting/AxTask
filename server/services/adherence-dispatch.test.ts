// @vitest-environment node
import { describe, expect, it } from "vitest";
import { dispatchAdherencePushNotifications } from "./adherence-dispatch";

describe("dispatchAdherencePushNotifications", () => {
  it("returns empty summary when adherence disabled", async () => {
    process.env.ADHERENCE_INTERVENTIONS_ENABLED = "false";
    const result = await dispatchAdherencePushNotifications();
    expect(result).toEqual({ attempted: 0, sent: 0 });
  });
});

