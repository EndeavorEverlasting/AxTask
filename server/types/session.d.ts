import "express-session";

declare module "express-session" {
  interface SessionData {
    /** After password/OAuth OK when user has TOTP — full login after POST /api/auth/totp/verify */
    pendingTotpLogin?: { userId: string; expiresAt: number };
    /** During enrollment — confirm with a valid code before persisting secret */
    totpEnrollment?: { userId: string; secretBase32: string; expiresAt: number };
  }
}
