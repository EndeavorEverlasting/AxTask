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
} as const;

export type MfaPurpose = (typeof MFA_PURPOSES)[keyof typeof MFA_PURPOSES];
