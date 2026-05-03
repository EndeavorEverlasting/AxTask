/**
 * Age eligibility for posting to community replies, collaboration inbox, and feedback.
 * Solo task/product use is not gated. Default minimum age is 13 (US COPPA-style threshold for public participation).
 */

export type PublicParticipationAgeCode = "birth_date_required" | "under_age";

export class PublicParticipationAgeError extends Error {
  readonly code: PublicParticipationAgeCode;
  readonly statusCode = 403;

  constructor(code: PublicParticipationAgeCode, message: string) {
    super(message);
    this.name = "PublicParticipationAgeError";
    this.code = code;
  }
}

/** Integer min age; default 13. Override with PUBLIC_PARTICIPATION_MIN_AGE (13–21). */
export function getPublicParticipationMinAge(): number {
  const raw = process.env.PUBLIC_PARTICIPATION_MIN_AGE?.trim();
  if (!raw) return 13;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return 13;
  return Math.min(21, Math.max(13, n));
}

function parseYmdStrict(s: string): { y: number; m: number; d: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { y, m, d };
}

/** Age in full years at `refUtc` (calendar comparison in UTC). */
export function ageCompletedYearsUtc(birthDateYmd: string, refUtc: Date): number | null {
  const bd = parseYmdStrict(birthDateYmd);
  if (!bd) return null;
  const ry = refUtc.getUTCFullYear();
  const rm = refUtc.getUTCMonth() + 1;
  const rd = refUtc.getUTCDate();
  let age = ry - bd.y;
  if (rm < bd.m || (rm === bd.m && rd < bd.d)) age -= 1;
  return age;
}

/**
 * @throws PublicParticipationAgeError when user cannot post to multiplayer surfaces.
 */
export function assertEligibleForPublicParticipation(birthDate: string | null | undefined): void {
  const minAge = getPublicParticipationMinAge();
  if (birthDate == null || String(birthDate).trim() === "") {
    throw new PublicParticipationAgeError(
      "birth_date_required",
      `Add your date of birth in Account or Profile before posting. You must be at least ${minAge} to use community, collaboration inbox, and feedback.`,
    );
  }
  const age = ageCompletedYearsUtc(String(birthDate).trim(), new Date());
  if (age === null) {
    throw new PublicParticipationAgeError(
      "birth_date_required",
      "Your saved date of birth is invalid. Update it in Account or Profile.",
    );
  }
  if (age < minAge) {
    throw new PublicParticipationAgeError(
      "under_age",
      `You must be at least ${minAge} to post in community, collaboration inbox, and feedback. You can still use tasks and other solo features.`,
    );
  }
}
