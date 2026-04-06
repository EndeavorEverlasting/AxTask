import { MFA_PURPOSES } from "@shared/mfa-purposes";
import { getUserById, isTaskOwner } from "./storage";

export type MfaChallengeCreateContext = {
  taskId?: string | null;
};

/**
 * Throws if the user may not start an MFA challenge for the given purpose
 * (e.g. non-admin requesting admin step-up, or community OTP without owning the task).
 */
export async function assertMfaChallengeCreateAllowed(
  userId: string,
  purpose: string,
  ctx: MfaChallengeCreateContext = {},
): Promise<void> {
  if (purpose === MFA_PURPOSES.ADMIN_STEP_UP) {
    const user = await getUserById(userId);
    if (!user || user.role !== "admin") {
      throw new Error("Admin step-up MFA is only available to administrators");
    }
    return;
  }
  if (purpose === MFA_PURPOSES.COMMUNITY_PUBLISH_TASK || purpose === MFA_PURPOSES.COMMUNITY_UNPUBLISH_TASK) {
    const tid = ctx.taskId?.trim();
    if (!tid) {
      throw new Error("taskId is required for community publish/unpublish MFA challenges");
    }
    if (!(await isTaskOwner(userId, tid))) {
      throw new Error("Only the task owner can request community publish/unpublish codes for this task");
    }
    return;
  }
}
