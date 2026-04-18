import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { hashActor } from "./actor-hash";

describe("actor-hash", () => {
  const prevSalt = process.env.ARCHETYPE_ANALYTICS_SALT;
  const prevSess = process.env.SESSION_SECRET;
  const prevNode = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.ARCHETYPE_ANALYTICS_SALT = "test-archetype-salt-value-1234";
    process.env.SESSION_SECRET = "session-test-secret";
  });

  afterEach(() => {
    process.env.ARCHETYPE_ANALYTICS_SALT = prevSalt;
    process.env.SESSION_SECRET = prevSess;
    process.env.NODE_ENV = prevNode;
  });

  it("is deterministic for the same userId", () => {
    const a = hashActor("user-123");
    const b = hashActor("user-123");
    expect(a).toEqual(b);
  });

  it("produces different hashes for different userIds", () => {
    const a = hashActor("user-1");
    const b = hashActor("user-2");
    expect(a).not.toEqual(b);
  });

  it("produces opaque, non-reversible output (no plaintext substring)", () => {
    const userId = "alice@example.com";
    const hashed = hashActor(userId);
    expect(hashed).not.toContain(userId);
    expect(hashed).not.toContain("alice");
    expect(hashed.length).toBeGreaterThan(20);
  });

  it("throws on empty userId", () => {
    expect(() => hashActor("")).toThrow(/non-empty/i);
  });

  it("fails closed in production when the salt is missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ARCHETYPE_ANALYTICS_SALT;
    expect(() => hashActor("user-x")).toThrow(/ARCHETYPE_ANALYTICS_SALT/);
  });

  it("falls back to SESSION_SECRET outside production", () => {
    delete process.env.ARCHETYPE_ANALYTICS_SALT;
    process.env.NODE_ENV = "test";
    const hashed = hashActor("user-y");
    expect(hashed).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("different salts produce different hashes for the same userId", () => {
    process.env.ARCHETYPE_ANALYTICS_SALT = "salt-one-long-enough-1234";
    const a = hashActor("user-z");
    process.env.ARCHETYPE_ANALYTICS_SALT = "salt-two-long-enough-5678";
    const b = hashActor("user-z");
    expect(a).not.toEqual(b);
  });
});
