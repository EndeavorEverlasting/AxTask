import { MFA_PURPOSES } from "@shared/mfa-purposes";
import { getUserById, isTaskOwner, getInvoiceForUser } from "./storage";

export type MfaChallengeCreateContext = {
  taskId?: string | null;
  invoiceId?: string | null;
};

const KNOWN_PURPOSES = new Set<string>(Object.values(MFA_PURPOSES));

async function requireExistingUser(userId: string): Promise<void> {
  const user = await getUserById(userId);
  if (!user) {
    throw new Error("User not found for MFA challenge");
  }
}

/**
 * Throws if the user may not start an MFA challenge for the given purpose
 * (e.g. non-admin requesting admin step-up, or community OTP without owning the task).
 */
export async function assertMfaChallengeCreateAllowed(
  userId: string,
  purpose: string,
  ctx: MfaChallengeCreateContext = {},
): Promise<void> {
  if (!KNOWN_PURPOSES.has(purpose)) {
    throw new Error(`Unsupported MFA purpose: ${purpose}`);
  }

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
    await requireExistingUser(userId);
    if (!(await isTaskOwner(userId, tid))) {
      throw new Error("Only the task owner can request community publish/unpublish codes for this task");
    }
    return;
  }

  if (
    purpose === MFA_PURPOSES.ACCOUNT_DATA_EXPORT ||
    purpose === MFA_PURPOSES.ACCOUNT_VERIFY_PHONE ||
    purpose === MFA_PURPOSES.BILLING_ADD_PAYMENT_METHOD
  ) {
    await requireExistingUser(userId);
    return;
  }

  if (purpose === MFA_PURPOSES.INVOICE_ISSUE || purpose === MFA_PURPOSES.INVOICE_CONFIRM_PAYMENT) {
    const invId = ctx.invoiceId?.trim();
    if (!invId) {
      throw new Error("invoiceId is required for invoice MFA challenges");
    }
    await requireExistingUser(userId);
    const inv = await getInvoiceForUser(invId, userId);
    if (!inv) {
      throw new Error("Invoice not found or access denied for MFA challenge");
    }
    return;
  }

  throw new Error(`MFA purpose not implemented: ${purpose}`);
}
