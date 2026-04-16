/** Explains why no completion payout was returned on a transition into `completed`. */
export function completionCoinSkipReason(args: {
  previousStatus: string;
  taskStatus: string;
  coinReward: unknown;
  alreadyAwarded: boolean;
}): string | null {
  if (args.taskStatus !== "completed" || args.previousStatus === "completed") {
    return null;
  }
  if (args.coinReward) return null;
  if (args.alreadyAwarded) return "already_awarded";
  return "not_awarded";
}
