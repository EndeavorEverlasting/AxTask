import { describe, expect, it } from "vitest";
import { isBrowserOriginAllowed } from "./browser-origin";

describe("isBrowserOriginAllowed", () => {
  const allowed = new Set(["https://app.example.com"]);

  it("allows listed origins", () => {
    expect(isBrowserOriginAllowed("https://app.example.com", allowed, true)).toBe(true);
  });

  it("allows http localhost with port when TLS is not forced (Docker / local prod)", () => {
    expect(isBrowserOriginAllowed("http://localhost:5000", allowed, false)).toBe(true);
    expect(isBrowserOriginAllowed("http://127.0.0.1:5000", allowed, false)).toBe(true);
  });

  it("blocks http localhost when TLS is forced", () => {
    expect(isBrowserOriginAllowed("http://localhost:5000", allowed, true)).toBe(false);
  });

  it("allows https localhost even when forceHttps (browser origin is still https)", () => {
    expect(isBrowserOriginAllowed("https://localhost:5000", allowed, true)).toBe(true);
  });

  it("rejects non-local http origins when forceHttps is false", () => {
    expect(isBrowserOriginAllowed("http://evil.test:5000", allowed, false)).toBe(false);
  });

  it("rejects typo-squatting local hostnames", () => {
    expect(isBrowserOriginAllowed("http://localhosst:5000", allowed, false)).toBe(false);
    expect(isBrowserOriginAllowed("http://127.0.0.2:5000", allowed, false)).toBe(false);
  });
});
