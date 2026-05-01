/**
 * Branded HTML email templates for AxTask.
 *
 * Pure string builders. No Resend/Twilio/fetch coupling and no env reads —
 * callers (e.g. server/services/otp-delivery.ts) pass the rendered `html` /
 * `text` / `subject` to whatever transport they already use.
 *
 * Design rules (Gmail + Outlook + iOS Mail compatibility):
 *   - Inline CSS only. No <style> blocks, no web fonts, no external assets.
 *   - Table-based layout for the card shell (Outlook ignores flexbox / grid).
 *   - Hidden preheader <span> so the inbox preview line reads "Your AxTask
 *     verification code is ready" instead of leaking the OTP.
 *   - All caller-provided values (code, purpose, resetUrl) are escaped via
 *     escapeHtml() before interpolation.
 */

/** Escape untrusted text for safe inclusion in HTML. */
export function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Minimal HTML → plain text fallback. Used when a caller wants a generic
 * fallback from a rendered template. buildOtpEmail / buildPasswordResetEmail
 * already return purpose-built `text` values that look better.
 */
export function plainTextFromHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type AxTaskEmailLayoutInput = {
  /** Inbox-preview line. Hidden in the body via 0px font. Plain text only. */
  preheader: string;
  /** Main heading above the card body. Plain text; will be escaped. */
  heading: string;
  /** Pre-rendered inner HTML. The caller is responsible for escaping. */
  bodyHtml: string;
  /** Optional small footer paragraph above the © line. Plain text; escaped. */
  footerNote?: string;
};

/**
 * Wrap bodyHtml in the branded AxTask shell. Returns a full HTML document
 * starting with <!doctype html>. Safe to hand straight to Resend.
 */
export function buildAxTaskEmailLayout(input: AxTaskEmailLayoutInput): string {
  const preheader = escapeHtml(input.preheader);
  const heading = escapeHtml(input.heading);
  const footerNote = input.footerNote ? escapeHtml(input.footerNote) : "";
  const year = new Date().getUTCFullYear();

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>AxTask</title>
  </head>
  <body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#0f172a;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f172a;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.25);overflow:hidden;">
            <tr>
              <td style="padding:24px 32px;background:linear-gradient(135deg,#10b981 0%,#06b6d4 60%,#6366f1 100%);color:#ffffff;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="font-size:20px;font-weight:700;letter-spacing:0.02em;">AxTask</td>
                    <td align="right" style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.85;">Secure delivery</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.25;color:#0f172a;font-weight:600;">${heading}</h1>
                <div style="font-size:15px;line-height:1.55;color:#1f2937;">
                  ${input.bodyHtml}
                </div>
              </td>
            </tr>
            ${footerNote ? `<tr>
              <td style="padding:0 32px 16px 32px;font-size:13px;line-height:1.55;color:#475569;">
                ${footerNote}
              </td>
            </tr>` : ""}
            <tr>
              <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b;">
                &copy; ${year} AxTask. Sent because this email is tied to an AxTask account.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export type BuildOtpEmailInput = {
  code: string;
  /** Optional MFA purpose token (e.g. "account:verify_phone"). Shown for context. */
  purpose?: string;
};

export type BuiltEmail = {
  subject: string;
  html: string;
  text: string;
};

/**
 * Branded OTP email. Keeps subject short so it renders cleanly in inbox lists
 * and puts the code in a large, monospace block for quick copy/paste.
 */
export function buildOtpEmail(input: BuildOtpEmailInput): BuiltEmail {
  const codeSafe = escapeHtml(input.code);
  const purposeSafe = input.purpose ? escapeHtml(input.purpose) : "";

  const bodyHtml = `
    <p style="margin:0 0 16px 0;">Use the code below to finish your AxTask verification. It expires shortly and can only be used once.</p>
    <div style="margin:20px 0;padding:20px 24px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;text-align:center;">
      <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#0f766e;margin-bottom:8px;">Verification code</div>
      <div style="font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:0.35em;color:#0f172a;">${codeSafe}</div>
    </div>
    ${purposeSafe ? `<p style="margin:0 0 12px 0;font-size:13px;color:#475569;">Requested for: <code style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#f1f5f9;border-radius:4px;padding:1px 6px;">${purposeSafe}</code></p>` : ""}
    <p style="margin:0;font-size:13px;color:#475569;">If you did not request this code, you can safely ignore this email. No changes have been made to your account.</p>
  `;

  const html = buildAxTaskEmailLayout({
    preheader: "Your AxTask verification code is ready.",
    heading: "Your AxTask verification code",
    bodyHtml,
    footerNote: "For your security, AxTask will never ask you to share this code with anyone.",
  });

  const text = [
    "AxTask verification code",
    "",
    `Code: ${input.code}`,
    purposeSafe ? `Requested for: ${input.purpose}` : "",
    "",
    "If you did not request this code, you can safely ignore this email.",
    "AxTask will never ask you to share this code with anyone.",
    "",
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");

  return {
    subject: "Your AxTask verification code",
    html,
    text,
  };
}

export type BuildPasswordResetEmailInput = {
  resetUrl: string;
};

/**
 * Branded password-reset email. Ready-to-use helper — the /api/auth/forgot-password
 * route currently only logs the URL in dev, so this is scaffolding for when the
 * route starts sending real emails. Not yet wired.
 */
export function buildPasswordResetEmail(input: BuildPasswordResetEmailInput): BuiltEmail {
  const urlSafe = escapeHtml(input.resetUrl);

  const bodyHtml = `
    <p style="margin:0 0 16px 0;">We received a request to reset the password for this AxTask account. Use the button below to choose a new password. The link expires in 30 minutes.</p>
    <div style="margin:20px 0;text-align:center;">
      <a href="${urlSafe}" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#10b981 0%,#06b6d4 100%);color:#0f172a;font-weight:600;text-decoration:none;border-radius:10px;box-shadow:0 6px 16px rgba(16,185,129,0.25);">Reset password</a>
    </div>
    <p style="margin:0 0 12px 0;font-size:13px;color:#475569;">If the button does not work, copy and paste this URL into your browser:</p>
    <p style="margin:0 0 16px 0;font-size:12px;word-break:break-all;color:#0f766e;">${urlSafe}</p>
    <p style="margin:0;font-size:13px;color:#475569;">If you did not request a password reset, you can safely ignore this email — your password will not change.</p>
  `;

  const html = buildAxTaskEmailLayout({
    preheader: "Reset your AxTask password.",
    heading: "Reset your AxTask password",
    bodyHtml,
    footerNote: "For your security, AxTask staff will never ask for your password.",
  });

  const text = [
    "Reset your AxTask password",
    "",
    "We received a request to reset the password for this AxTask account.",
    "Open the link below to choose a new password. It expires in 30 minutes.",
    "",
    input.resetUrl,
    "",
    "If you did not request a password reset, you can safely ignore this email.",
    "",
  ].join("\n");

  return {
    subject: "Reset your AxTask password",
    html,
    text,
  };
}
