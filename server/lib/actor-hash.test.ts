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

  it("is deterministic across UUID, email, unicode, and long inputs", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const email = "someone+tag@example.co.jp";
    const unicode = "ユーザー_नमस्ते_مرحبا";
    const long = "x".repeat(512);

    for (const id of [uuid, email, unicode, long]) {
      const a = hashActor(id);
      const b = hashActor(id);
      expect(a, `deterministic for ${id}`).toEqual(b);
      expect(a.length).toBeGreaterThan(20);
      expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("small collision smoke: 100 distinct userIds produce 100 distinct hashes", () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      hashes.add(hashActor(`collision-probe-${i}`));
    }
    expect(hashes.size).toBe(100);
  });

  it("accepts a salt exactly at the 16-char floor", () => {
    process.env.ARCHETYPE_ANALYTICS_SALT = "1234567890abcdef"; // 16 chars
    expect(() => hashActor("user-bound")).not.toThrow();
  });

  it("falls back in production if salt is shorter than 16 chars (treated as missing)", () => {
    process.env.NODE_ENV = "production";
    process.env.ARCHETYPE_ANALYTICS_SALT = "too-short"; // < 16 chars
    expect(() => hashActor("user-x")).toThrow(/ARCHETYPE_ANALYTICS_SALT/);
  });
});
