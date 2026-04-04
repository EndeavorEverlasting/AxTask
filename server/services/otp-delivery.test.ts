// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { canDeliverMfaInProduction, deliverMfaOtp } from "./otp-delivery";

describe("canDeliverMfaInProduction", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows any channel outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(canDeliverMfaInProduction("email")).toBe(true);
    expect(canDeliverMfaInProduction("sms")).toBe(true);
  });

  it("requires Resend in production for email", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    expect(canDeliverMfaInProduction("email")).toBe(false);
    vi.stubEnv("RESEND_API_KEY", "re_xxx");
    expect(canDeliverMfaInProduction("email")).toBe(true);
  });

  it("requires Twilio in production for sms", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACxxx");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token");
    vi.stubEnv("TWILIO_FROM_NUMBER", "+15551234567");
    expect(canDeliverMfaInProduction("sms")).toBe(true);
  });
});

describe("deliverMfaOtp", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("succeeds in development without network", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const r = await deliverMfaOtp({
      channel: "email",
      code: "123456",
      purpose: "test",
      email: "a@b.com",
      phoneE164: null,
    });
    expect(r.ok).toBe(true);
  });
});
