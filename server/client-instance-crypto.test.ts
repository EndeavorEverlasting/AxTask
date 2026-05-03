import { describe, it, expect, beforeEach, vi } from "vitest";
import { hashClientInstanceIdForLedger, isClientInstanceIdWellFormed } from "./client-instance-crypto";

describe("client-instance-crypto", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    delete process.env.SESSION_SECRET;
  });

  it("accepts UUID v4", () => {
    expect(isClientInstanceIdWellFormed("550e8400-e29b-41d4-a816-446655440000")).toBe(true);
    expect(isClientInstanceIdWellFormed("not-a-uuid")).toBe(false);
  });

  it("hashes instance id deterministically with SESSION_SECRET", () => {
    vi.stubEnv("SESSION_SECRET", "x".repeat(32));
    const a = hashClientInstanceIdForLedger("550e8400-e29b-41d4-a816-446655440000");
    const b = hashClientInstanceIdForLedger("550e8400-e29b-41d4-a816-446655440000");
    expect(a).toBe(b);
    expect(a.length).toBe(64);
    const c = hashClientInstanceIdForLedger("6ba7b810-9dad-11d1-80b4-00c04fd430c8");
    expect(c).not.toBe(a);
  });
});
