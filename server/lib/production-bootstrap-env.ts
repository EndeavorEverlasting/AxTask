/**
 * Production-only guards run at bootstrap so misconfiguration fails before listening.
 */
export function assertProductionAuthAuditPepper(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;
  const p = env.AUTH_AUDIT_PEPPER?.trim();
  if (!p || p.length < 16) {
    throw new Error(
      "AUTH_AUDIT_PEPPER must be set (min 16 characters) in production for login audit hashing",
    );
  }
}
