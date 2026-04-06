/**
 * Production OTP delivery via Resend (email) and Twilio (SMS).
 * Development: logs only; API still returns devCode for local testing.
 */

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
  challengeId: string;
  code: string;
  purpose: string;
  email: string;
  /** Required when channel is sms */
  phoneE164: string | null;
};

function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL?.trim() || process.env.PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return process.env.NODE_ENV === "production" ? "https://app.axtask.com" : "http://localhost:5173";
}

function buildMfaHandoffUrl(params: { challengeId: string; code: string; purpose: string }): string {
  const base = appBaseUrl();
  const q = new URLSearchParams({
    challengeId: params.challengeId,
    code: params.code,
    purpose: params.purpose,
  });
  return `${base}/mfa/confirm?${q.toString()}`;
}

async function sendResendEmail(to: string, subject: string, html: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set" };
  const from = process.env.RESEND_FROM?.trim() || "AxTask <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
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
  const { channel, challengeId, code, purpose, email, phoneE164 } = params;

  if (process.env.NODE_ENV !== "production") {
    const dest = channel === "email" ? email : phoneE164;
    console.log(`[MFA/OTP] channel=${channel} purpose=${purpose} to=${dest} code=${code}`);
    return { ok: true };
  }

  if (channel === "email") {
    const handoffUrl = buildMfaHandoffUrl({ challengeId, code, purpose });
    const html = `
      <div style="font-family:Inter,Segoe UI,Arial,sans-serif;line-height:1.5;color:#111827">
        <h2 style="margin:0 0 10px 0">Confirm it's you</h2>
        <p style="margin:0 0 8px 0">Your AxTask verification code is <strong style="font-size:20px;letter-spacing:2px">${code}</strong>.</p>
        <p style="margin:0 0 14px 0;color:#4b5563">For a seamless handoff, open the button below and AxTask will attempt to auto-load the active flow.</p>
        <p style="margin:0 0 16px 0">
          <a href="${handoffUrl}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:#0f172a;color:#fff;text-decoration:none;font-weight:600">Open AxTask confirmation</a>
        </p>
        <p style="margin:0;color:#6b7280;font-size:12px">If you did not request this, you can ignore this email.</p>
      </div>`;
    return sendResendEmail(email, "Your AxTask verification code", html);
  }

  if (!phoneE164) {
    return { ok: false, error: "No phone number for SMS delivery" };
  }
  return sendTwilioSms(phoneE164, `AxTask code: ${code}`);
}

export async function sendWelcomeExperienceEmail(params: {
  email: string;
  displayName?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const first = params.displayName?.trim() || "there";
  const url = `${appBaseUrl()}/welcome-confirm`;
  if (process.env.NODE_ENV !== "production") {
    console.log(`[WELCOME] email=${params.email} url=${url}`);
    return { ok: true };
  }
  const html = `
    <div style="font-family:Inter,Segoe UI,Arial,sans-serif;line-height:1.5;color:#111827">
      <h1 style="margin:0 0 10px 0;font-size:24px">Welcome to AxTask, ${first}.</h1>
      <p style="margin:0 0 14px 0;color:#374151">Your workspace is ready. We'll auto-load the AxTask experience when you open this page.</p>
      <p style="margin:0 0 16px 0">
        <a href="${url}" style="display:inline-block;padding:11px 16px;border-radius:12px;background:linear-gradient(120deg,#0ea5e9,#8b5cf6);color:#fff;text-decoration:none;font-weight:700">
          ✓ Launch My AxTask Adventure
        </a>
      </p>
      <p style="margin:0;color:#6b7280;font-size:12px">If it doesn't load automatically, use the button above or this direct link: <a href="${url}">${url}</a>.</p>
    </div>`;
  return sendResendEmail(params.email, "Welcome to AxTask - your workspace is ready", html);
}
