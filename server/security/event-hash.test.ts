import { describe, expect, it } from "vitest";
import { buildSecurityEventHash } from "./event-hash";

describe("buildSecurityEventHash", () => {
  it("is deterministic for same payload", () => {
    const input = {
      eventType: "api_request",
      actorUserId: "user-1",
      route: "/api/tasks",
      method: "POST",
      statusCode: 201,
      ipAddress: "127.0.0.1",
      userAgentHash: "abc",
      payloadJson: "{\"x\":1}",
      prevHash: "prev",
      createdAtIso: "2026-04-03T00:00:00.000Z",
    };
    expect(buildSecurityEventHash(input)).toBe(buildSecurityEventHash(input));
  });

  it("changes when chain link changes", () => {
    const base = {
      eventType: "api_request",
      createdAtIso: "2026-04-03T00:00:00.000Z",
    };
    const a = buildSecurityEventHash({ ...base, prevHash: "A" });
    const b = buildSecurityEventHash({ ...base, prevHash: "B" });
    expect(a).not.toBe(b);
  });
});
