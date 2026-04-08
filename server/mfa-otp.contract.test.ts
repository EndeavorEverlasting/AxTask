// @vitest-environment node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

/**
 * MFA challenge 503 in production means delivery is not configured (Resend / Twilio),
 * not a DNS failure. These contracts keep that behavior and copy stable for operators.
 */
describe("MFA / OTP API contracts", () => {
  it("registers POST /api/mfa/challenge and invoices alias with shared handler", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain('app.post("/api/mfa/challenge", requireAuth, postMfaChallenge)');
    expect(routes).toContain('app.post("/api/invoices/mfa/challenge", requireAuth, postMfaChallenge)');
  });

  it("returns 503 when production delivery is not configured (email vs sms copy)", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain("canDeliverMfaInProduction(channel)");
    expect(routes).toContain('return res.status(503).json({');
    expect(routes).toContain("Email OTP is not configured. Set RESEND_API_KEY");
    expect(routes).toContain("SMS OTP is not configured. Set TWILIO_ACCOUNT_SID");
  });

  it("rolls back challenge when deliverMfaOtp fails (502 to client)", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain("deleteMfaChallengeById(challenge.challengeId");
    expect(routes).toContain('return res.status(502).json({ message: deliver.error })');
  });

  it("exposes devCode only outside production", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain(
      'devCode: process.env.NODE_ENV === "production" ? undefined : challenge.code',
    );
  });

  it("documents phone verify SMS path requires phoneE164", () => {
    const routes = fs.readFileSync(path.join(root, "server", "routes.ts"), "utf8");
    expect(routes).toContain("MFA_PURPOSES.ACCOUNT_VERIFY_PHONE");
    expect(routes).toContain("phoneE164 is required to verify a new phone number");
  });
});
