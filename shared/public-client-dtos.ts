import type {
  AttachmentAsset,
  CoinTransaction,
  SafeUser,
  UserBadge,
  Wallet,
} from "./schema";

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

/** Badge payload safe for client consumption. */
export type PublicBadge = Pick<UserBadge, "id" | "badgeId" | "earnedAt">;

export function toPublicBadge(badge: UserBadge): PublicBadge {
  return {
    id: badge.id,
    badgeId: badge.badgeId,
    earnedAt: badge.earnedAt,
  };
}

export function toPublicBadges(badges: UserBadge[]): PublicBadge[] {
  return badges.map(toPublicBadge);
}

/**
 * Attachment reference returned alongside any composable message body.
 * Only the fields the SPA needs for rendering are included; storage keys,
 * raw metadata JSON, and user ids never leak back.
 *
 * `downloadUrl` is session-scoped: /api/attachments/:id/download requires
 * the owning user's cookie, so a raw URL copy-out does not leak the asset.
 */
export type PublicAttachmentRef = {
  id: string;
  kind: string;
  mimeType: string;
  fileName: string | null;
  byteSize: number;
  downloadUrl: string;
};

export function toPublicAttachmentRef(asset: AttachmentAsset): PublicAttachmentRef {
  return {
    id: asset.id,
    kind: asset.kind,
    mimeType: asset.mimeType,
    fileName: asset.fileName,
    byteSize: asset.byteSize,
    downloadUrl: `/api/attachments/${asset.id}/download`,
  };
}

export function toPublicAttachmentRefs(assets: AttachmentAsset[]): PublicAttachmentRef[] {
  return assets.map(toPublicAttachmentRef);
}
