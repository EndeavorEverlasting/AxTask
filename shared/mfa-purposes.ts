/**
 * Stable MFA challenge purpose strings. Clients must pass the matching purpose
 * when creating a challenge, and servers verify the stored purpose on sensitive routes.
 */
export const MFA_PURPOSES = {
  INVOICE_ISSUE: "invoice:issue",
  INVOICE_CONFIRM_PAYMENT: "invoice:confirm_payment",
  BILLING_ADD_PAYMENT_METHOD: "billing:add_payment_method",
  /** Binds a verified phone to the account (SMS OTP to the number being added). */
  ACCOUNT_VERIFY_PHONE: "account:verify_phone",
  /** Step-up verification before admin API access (production only). */
  ADMIN_STEP_UP: "admin:step_up",
  /** Step-up before self-service GDPR export/import of account data (production only). */
  ACCOUNT_DATA_EXPORT: "account:data_export",
  /** Publish a task to the public community directory (SMS/email OTP). */
  COMMUNITY_PUBLISH_TASK: "community:publish_task",
  /** Remove a task from the public community directory. */
  COMMUNITY_UNPUBLISH_TASK: "community:unpublish_task",
} as const;

export type MfaPurpose = (typeof MFA_PURPOSES)[keyof typeof MFA_PURPOSES];
