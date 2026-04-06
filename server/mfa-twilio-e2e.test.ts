// @vitest-environment node
/**
 * Optional live Twilio SMS test. Sends one real message (billable).
 *
 * Run when debugging production MFA / SMS:
 *   cross-env RUN_TWILIO_MFA_E2E=1 TWILIO_E2E_DESTINATION=+1XXXXXXXXXX npm run test:mfa-twilio-e2e
 *
 * Requires the same Twilio env vars as production: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
 * and TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER.
 */
import { afterEach, describe, expect, it } from "vitest";
import { deliverMfaOtp } from "./services/otp-delivery";

function twilioMfaE2eReady(): boolean {
  if (process.env.RUN_TWILIO_MFA_E2E !== "1") return false;
  const dest = process.env.TWILIO_E2E_DESTINATION?.trim();
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from =
    process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || process.env.TWILIO_FROM_NUMBER?.trim();
  return !!(dest && sid && token && from);
}

describe.skipIf(!twilioMfaE2eReady())("Twilio MFA delivery (live E2E)", () => {
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  it("delivers SMS via Twilio Messages API", async () => {
    process.env.NODE_ENV = "production";
    const phoneE164 = process.env.TWILIO_E2E_DESTINATION!.trim();

    const result = await deliverMfaOtp({
      channel: "sms",
      challengeId: "00000000-0000-4000-8000-00000000e2e0",
      code: "826001",
      purpose: "e2e:twilio_mfa",
      email: "e2e@example.com",
      phoneE164,
    });

    expect(result).toEqual({ ok: true });
  });
});
