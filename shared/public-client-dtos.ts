import type { CoinTransaction, SafeUser, Wallet } from "./schema";

/**
 * Session user returned from GET /api/auth/me (and similar).
 * Omits fields that are not needed for routine SPA state and should not sit in DevTools by default.
 */
export type PublicSessionUser = Omit<
  SafeUser,
  "securityQuestion" | "banReason" | "bannedBy" | "bannedAt"
>;

export function toPublicSessionUser(user: SafeUser): PublicSessionUser {
  const {
    securityQuestion: _sq,
    banReason: _br,
    bannedBy: _bb,
    bannedAt: _ba,
    ...rest
  } = user;
  return rest;
}

/** Wallet row without redundant owner id (caller is always the authenticated user). */
export type PublicWallet = Omit<Wallet, "userId">;

export function toPublicWallet(wallet: Wallet): PublicWallet {
  const { userId: _uid, ...rest } = wallet;
  return rest;
}

/** Coin ledger line safe for the main app Network tab. */
export type PublicCoinTransaction = Omit<CoinTransaction, "userId" | "details"> & {
  details: string | null;
};

const SENSITIVE_REASON = /\b(invoice|payment|billing|refund|card|mfa|charge)\b/i;

function sanitizeCoinDetails(reason: string, details: string | null): string | null {
  if (!details) return null;
  if (SENSITIVE_REASON.test(reason) || SENSITIVE_REASON.test(details)) {
    return null;
  }
  const max = 240;
  if (details.length <= max) return details;
  return `${details.slice(0, max)}…`;
}

export function toPublicCoinTransaction(row: CoinTransaction): PublicCoinTransaction {
  const { userId: _uid, details, ...rest } = row;
  return {
    ...rest,
    details: sanitizeCoinDetails(row.reason, details),
  };
}

export function toPublicCoinTransactions(rows: CoinTransaction[]): PublicCoinTransaction[] {
  return rows.map(toPublicCoinTransaction);
}
