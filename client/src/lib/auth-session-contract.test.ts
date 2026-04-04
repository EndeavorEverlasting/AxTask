import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  AUTH_LOGIN_PATH,
  AUTH_LOGOUT_PATH,
  AUTH_ME_PATH,
  AUTH_REGISTER_PATH,
  AXTASK_CSRF_COOKIE,
  AXTASK_CSRF_HEADER,
} from "@shared/http-auth";
import { getCsrfToken } from "./queryClient";

describe("auth session contract (same-origin offline + online)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { cookie: "" } as Document);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes stable paths that match the server router", () => {
    expect(AUTH_ME_PATH).toBe("/api/auth/me");
    expect(AUTH_LOGIN_PATH).toBe("/api/auth/login");
    expect(AUTH_REGISTER_PATH).toBe("/api/auth/register");
    expect(AUTH_LOGOUT_PATH).toBe("/api/auth/logout");
  });

  it("reads the CSRF cookie name aligned with the server", () => {
    document.cookie = `${AXTASK_CSRF_COOKIE}=abc123; Path=/`;
    expect(getCsrfToken()).toBe("abc123");
  });

  it("uses the CSRF header name expected by Express", () => {
    expect(AXTASK_CSRF_HEADER).toBe("x-csrf-token");
  });
});
