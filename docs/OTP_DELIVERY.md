# OTP / MFA delivery (email and SMS)

AxTask sends one-time codes for **step-up MFA** after you are logged in (billing, invoice actions, phone verification). Delivery is **channel-aware**: `email` or `sms` on `POST /api/mfa/challenge`.

**Planned (separate from this doc’s API):** verification during **new account registration** to reduce abuse — see [`MFA_SIGNUP_VERIFICATION.md`](./MFA_SIGNUP_VERIFICATION.md). That work targets **sign-up only**; existing users keep normal login and only see OTP when a sensitive flow already requires it.

## Development

- **No third-party keys required.** Codes are logged to the server console as `[MFA/OTP] channel=…`.
- The API may still return `devCode` in the JSON response (never in production) so local UIs can move quickly.

## Production

### Email (Resend)

1. Create an API key at [Resend](https://resend.com/).
2. Set:

| Variable | Required | Description |
|----------|----------|-------------|
| `RESEND_API_KEY` | Yes (for email OTP) | API key |
| `RESEND_FROM` | No | From address, e.g. `AxTask <billing@yourdomain.com>` |

Verified domain in Resend is required for arbitrary `from` addresses.

### SMS (Twilio)

1. Create a [Twilio](https://www.twilio.com/) account, buy or verify a number, or configure a **Messaging Service**.
2. Set:

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Yes | Account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Auth token |
| `TWILIO_MESSAGING_SERVICE_SID` | One of these | Messaging Service SID (preferred) |
| `TWILIO_FROM_NUMBER` | One of these | E.164 sender if not using a Messaging Service |

If SMS is not configured, `channel: "sms"` returns **503** in production with a clear message.

### Enforcement

- In `NODE_ENV=production`, **email** challenges require `RESEND_API_KEY`.
- **SMS** challenges require full Twilio configuration as above.
- Users must **verify a phone** under `/account` before SMS can be used for purposes like `billing:add_payment_method`. Phone binding uses purpose `account:verify_phone` and sends the code to the number being verified.

## API summary

- `POST /api/mfa/challenge` — body: `{ purpose, channel?: "email"|"sms", phoneE164?: string }`. For `account:verify_phone` + SMS, `phoneE164` is required.
- Response includes `deliveredVia`, `maskedDestination`, and optionally `devCode` (non-production only).
- `POST /api/account/phone/verify/confirm` — `{ challengeId, code }` after SMS verification challenge.

## Database

Run `npm run db:push` after pulling changes so `users.phone_e164`, `users.phone_verified_at`, and MFA `delivery_channel` / `sms_destination_e164` columns exist.
