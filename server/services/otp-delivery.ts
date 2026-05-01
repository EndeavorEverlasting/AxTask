/**
 * Production OTP delivery via Resend (email) and Twilio (SMS).
 * Development: logs only; API still returns devCode for local testing.
 *
 * Email HTML is built by server/services/email-templates.ts so every OTP
 * email ships with the AxTask brand shell, preheader, and escaped OTP block.
 */
import { buildOtpEmail } from "./email-templates";

export type MfaDeliveryChannel = "email" | "sms";

export function canDeliverMfaInProduction(channel: MfaDeliveryChannel): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  if (channel === "email") {
    return !!process.env.RESEND_API_KEY?.trim();
  }
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from =
    process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || process.env.TWILIO_FROM_NUMBER?.trim();
  return !!(sid && token && from);
}

export type DeliverMfaParams = {
  channel: MfaDeliveryChannel;
  code: string;
  purpose: string;
  email: string;
  /** Required when channel is sms */
  phoneE164: string | null;
};

async function sendResendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set" };
  const from = process.env.RESEND_FROM?.trim() || "AxTask <onboarding@resend.dev>";
  const body: Record<string, unknown> = { from, to: [to], subject, html };
  if (text) body.text = text;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Resend error ${res.status}: ${text.slice(0, 200)}` };
  }
  return { ok: true };
}

async function sendTwilioSms(to: string, body: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) return { ok: false, error: "Twilio credentials are not set" };

  const params = new URLSearchParams();
  params.set("To", to);
  params.set("Body", body);
  const msid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  const fromNum = process.env.TWILIO_FROM_NUMBER?.trim();
  if (msid) {
    params.set("MessagingServiceSid", msid);
  } else if (fromNum) {
    params.set("From", fromNum);
  } else {
    return { ok: false, error: "Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER" };
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Twilio error ${res.status}: ${text.slice(0, 200)}` };
  }
  return { ok: true };
}

export async function deliverMfaOtp(params: DeliverMfaParams): Promise<{ ok: true } | { ok: false; error: string }> {
  const { channel, code, purpose, email, phoneE164 } = params;

  if (process.env.NODE_ENV !== "production") {
    const dest = channel === "email" ? email : phoneE164;
    console.log(`[MFA/OTP] channel=${channel} purpose=${purpose} to=${dest} code=${code}`);
    return { ok: true };
  }

  if (channel === "email") {
    const email_ = buildOtpEmail({ code, purpose });
    return sendResendEmail(email, email_.subject, email_.html, email_.text);
  }

  if (!phoneE164) {
    return { ok: false, error: "No phone number for SMS delivery" };
  }
  return sendTwilioSms(phoneE164, `AxTask code: ${code}`);
}
