/**
 * Admin appeal resolution thresholds:
 * - 1 admin: a single admin's vote decides (grant or deny).
 * - 2 admins: unanimous — both must vote the same way to resolve (dual "unitary" attempt).
 * - 3+ admins: two-thirds supermajority required to grant or to deny.
 */
export type AppealThreshold = {
  adminCount: number;
  /** Votes needed to mark appeal "granted" */
  grantNeeded: number;
  /** Votes needed to mark appeal "denied" */
  denyNeeded: number;
  /** Short label for UI */
  ruleLabel: string;
};

export function computeAppealVoteThreshold(adminCount: number): AppealThreshold {
  if (adminCount <= 0) {
    return {
      adminCount: 0,
      grantNeeded: Number.POSITIVE_INFINITY,
      denyNeeded: Number.POSITIVE_INFINITY,
      ruleLabel: "No administrators configured",
    };
  }
  if (adminCount === 1) {
    return {
      adminCount: 1,
      grantNeeded: 1,
      denyNeeded: 1,
      ruleLabel: "Single admin — one vote decides",
    };
  }
  if (adminCount === 2) {
    return {
      adminCount: 2,
      grantNeeded: 2,
      denyNeeded: 2,
      ruleLabel: "Two admins — unanimous agreement required",
    };
  }
  const need = Math.ceil((2 * adminCount) / 3);
  return {
    adminCount,
    grantNeeded: need,
    denyNeeded: need,
    ruleLabel: `Three or more admins — two-thirds supermajority (${need} of ${adminCount})`,
  };
}

export function evaluateAppealOutcome(
  adminCount: number,
  grantVotes: number,
  denyVotes: number,
): "grant" | "deny" | "pending" {
  const { grantNeeded, denyNeeded } = computeAppealVoteThreshold(adminCount);
  if (grantVotes >= grantNeeded) return "grant";
  if (denyVotes >= denyNeeded) return "deny";
  return "pending";
}
