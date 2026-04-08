// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  it("rejects sms when account sid or token missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token");
    vi.stubEnv("TWILIO_FROM_NUMBER", "+15551234567");
    expect(canDeliverMfaInProduction("sms")).toBe(false);

    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACxxx");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    expect(canDeliverMfaInProduction("sms")).toBe(false);
  });

  it("rejects sms when neither messaging service nor from number is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACxxx");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token");
    vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "");
    vi.stubEnv("TWILIO_FROM_NUMBER", "");
    expect(canDeliverMfaInProduction("sms")).toBe(false);
  });

  it("accepts sms with messaging service sid only", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACxxx");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token");
    vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MGxxxxxxxx");
    vi.stubEnv("TWILIO_FROM_NUMBER", "");
    expect(canDeliverMfaInProduction("sms")).toBe(true);
  });
});

describe("deliverMfaOtp", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("succeeds in development without network", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const r = await deliverMfaOtp({
      channel: "email",
      challengeId: "c1",
      code: "123456",
      purpose: "test",
      email: "a@b.com",
      phoneE164: null,
    });
    expect(r.ok).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls Resend in production for email and includes mfa confirm handoff link", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_key");
    vi.stubEnv("BASE_URL", "https://billing.example.com");
    vi.stubEnv("APP_BASE_URL", "");
    vi.stubEnv("PUBLIC_APP_URL", "");

    const fetchMock = vi.mocked(fetch);
    const r = await deliverMfaOtp({
      channel: "email",
      challengeId: "550e8400-e29b-41d4-a716-446655440000",
      code: "654321",
      purpose: "billing:add_payment_method",
      email: "user@example.com",
      phoneE164: null,
    });

    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const payload = JSON.parse(String(init?.body)) as { html: string; to: string[] };
    expect(payload.to).toEqual(["user@example.com"]);
    expect(payload.html).toContain("654321");
    // href is HTML-escaped (&amp;) and query order is stable from URLSearchParams
    expect(payload.html).toContain(
      'href="https://billing.example.com/mfa/confirm?challengeId=550e8400-e29b-41d4-a716-446655440000&amp;code=654321&amp;purpose=billing%3Aadd_payment_method"',
    );
  });

  it("returns Resend error body on non-OK response", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("domain not verified", { status: 422 })),
    );

    const r = await deliverMfaOtp({
      channel: "email",
      challengeId: "c1",
      code: "111111",
      purpose: "test",
      email: "a@b.com",
      phoneE164: null,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Resend error 422");
  });

  it("posts to Twilio with MessagingServiceSid when set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "auth-token");
    vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MGbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    vi.stubEnv("TWILIO_FROM_NUMBER", "");

    const fetchMock = vi.mocked(fetch);
    const r = await deliverMfaOtp({
      channel: "sms",
      challengeId: "c1",
      code: "222222",
      purpose: "test",
      email: "a@b.com",
      phoneE164: "+15551230001",
    });

    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Messages.json");
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("To")).toBe("+15551230001");
    expect(body.get("Body")).toBe("AxTask code: 222222");
    expect(body.get("MessagingServiceSid")).toBe("MGbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    expect(body.get("From")).toBeNull();
  });

  it("posts to Twilio with From when messaging service is not set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "auth-token");
    vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "");
    vi.stubEnv("TWILIO_FROM_NUMBER", "+15559998888");

    const fetchMock = vi.mocked(fetch);
    const r = await deliverMfaOtp({
      channel: "sms",
      challengeId: "c1",
      code: "333333",
      purpose: "test",
      email: "a@b.com",
      phoneE164: "+15551230002",
    });

    expect(r.ok).toBe(true);
    const body = new URLSearchParams(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.get("From")).toBe("+15559998888");
    expect(body.get("MessagingServiceSid")).toBeNull();
  });

  it("fails sms in production when phoneE164 is null", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACxxx");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "t");
    vi.stubEnv("TWILIO_FROM_NUMBER", "+1");

    const r = await deliverMfaOtp({
      channel: "sms",
      challengeId: "c1",
      code: "444444",
      purpose: "test",
      email: "a@b.com",
      phoneE164: null,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("No phone number");
  });

  it("surfaces Twilio API errors", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "auth-token");
    vi.stubEnv("TWILIO_FROM_NUMBER", "+15559998888");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"message":"Authenticate"}', { status: 401 })),
    );

    const r = await deliverMfaOtp({
      channel: "sms",
      challengeId: "c1",
      code: "555555",
      purpose: "test",
      email: "a@b.com",
      phoneE164: "+15551230003",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Twilio error 401");
  });
});
