import { verifyMfaChallenge, getUserRowById } from "../storage";
import { verifyUserTotpFromCiphertext } from "./totp";

/**
 * Accept either email/SMS OTP challenge or TOTP (when enabled) for the same 6-digit input.
 * Phone verification flows must not use this — they require SMS metadata.
 */
export async function verifyMfaChallengeOrTotp(
  userId: string,
  challengeId: string,
  code: string,
  expectedPurpose?: string,
): Promise<boolean> {
  const fromChallenge = await verifyMfaChallenge(userId, challengeId, code, expectedPurpose);
  if (fromChallenge) return true;

  const row = await getUserRowById(userId);
  if (!row?.totpEnabledAt || !row.totpSecretCiphertext) return false;
  return verifyUserTotpFromCiphertext(row.totpSecretCiphertext, code);
}
