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
    vi.unstubAllGlobals();
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

  it("in production posts AxTask-branded HTML + plain-text fallback to Resend", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const r = await deliverMfaOtp({
      channel: "email",
      code: "314159",
      purpose: "account:verify_phone",
      email: "user@example.com",
      phoneE164: null,
    });

    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(init.body as string) as {
      subject: string;
      html: string;
      text?: string;
      to: string[];
    };
    expect(body.to).toEqual(["user@example.com"]);
    expect(body.subject).toBe("Your AxTask verification code");
    expect(body.html).toContain("AxTask");
    expect(body.html).toContain("314159");
    expect(body.html).toContain("account:verify_phone");
    expect(body.text).toContain("AxTask verification code");
    expect(body.text).toContain("314159");
    // Regression guard: the old inline template was a bare `<p>` paragraph.
    expect(body.html.startsWith("<!doctype html>")).toBe(true);
  });

  it("in production returns an error shape when Resend rejects", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");

    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 422,
      text: async () => "bad domain",
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const r = await deliverMfaOtp({
      channel: "email",
      code: "000000",
      purpose: "test",
      email: "user@example.com",
      phoneE164: null,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("Resend error 422");
    }
  });
});
