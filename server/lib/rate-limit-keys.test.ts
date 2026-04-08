// @vitest-environment node
import type { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { describe, expect, it } from "vitest";
import { trustedIpKey, userOrIpKey } from "./rate-limit-keys";

function mockReq(partial: Partial<Request> & { user?: { id: string } }): Request {
  return partial as Request;
}

describe("rate-limit-keys", () => {
  it("userOrIpKey returns user-scoped key when authenticated", () => {
    const req = mockReq({ user: { id: "user-1" } });
    expect(userOrIpKey(req)).toBe("user:user-1");
  });

  it("trustedIpKey returns user-scoped key when authenticated", () => {
    const req = mockReq({ user: { id: "abc" } });
    expect(trustedIpKey(req)).toBe("user:abc");
  });

  it("userOrIpKey uses ipKeyGenerator for IPv4", () => {
    const req = mockReq({ ip: "203.0.113.10", socket: undefined });
    expect(userOrIpKey(req)).toBe(ipKeyGenerator("203.0.113.10"));
  });

  it("userOrIpKey uses ipKeyGenerator for IPv6", () => {
    const ip = "2001:db8::1";
    const req = mockReq({ ip, socket: undefined });
    expect(userOrIpKey(req)).toBe(ipKeyGenerator(ip));
  });

  it("express-rate-limit accepts userOrIpKey without IPv6 validation errors", () => {
    expect(() =>
      rateLimit({
        windowMs: 60_000,
        max: 10,
        keyGenerator: userOrIpKey,
      }),
    ).not.toThrow();
  });

  it("express-rate-limit accepts trustedIpKey without IPv6 validation errors", () => {
    expect(() =>
      rateLimit({
        windowMs: 60_000,
        max: 10,
        keyGenerator: trustedIpKey,
      }),
    ).not.toThrow();
  });
});
