import type {
  AttachmentAsset,
  CoinTransaction,
  SafeUser,
  Task,
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

/**
 * List-view task DTO for `/api/tasks` and `/api/tasks/:id`.
 *
 * Privacy: strips `userId` so the main task cache in a browser tab doesn't
 * carry raw user ids. The caller is already the authenticated user, so
 * `req.user!.id` is enough on the server side.
 *
 * Bandwidth: replaces `classificationAssociations` (a jsonb array of
 * `{label, confidence}` objects that can be ~200B+ per task) with a
 * single-integer `classificationExtraCount`. The associations are only
 * needed by the classify dialog, which lazy-fetches the full task via
 * GET /api/tasks/:id (this same slimmer returns the full associations
 * array on single-row reads, because the dialog needs them). List reads
 * only render a "+N" pill, so the array is pure dead weight on list.
 *
 * Editing: `TaskForm` uses every other field on this shape, so edits
 * continue to work off the cache without a round-trip.
 *
 * Shape version bumps belong in `PublicTaskListItem` so the contract
 * test below locks the field set to prevent silent drift.
 */
export type PublicTaskListItem = Omit<Task, "userId" | "classificationAssociations"> & {
  /** `classificationAssociations.length - 1` (clamped to 0). */
  classificationExtraCount: number;
};

export function toPublicTaskListItem(task: Task): PublicTaskListItem {
  const { userId: _uid, classificationAssociations, ...rest } = task;
  const extras = Array.isArray(classificationAssociations)
    ? Math.max(0, classificationAssociations.length - 1)
    : 0;
  return {
    ...rest,
    classificationExtraCount: extras,
  };
}

export function toPublicTaskListItems(rows: Task[]): PublicTaskListItem[] {
  /* Hot path on /tasks; a simple `.map` beats a for-loop by one less
   * allocation under V8 for arrays < ~1e4 entries. Keep allocation-light. */
  return rows.map(toPublicTaskListItem);
}

/**
 * Detail DTO used by the edit/classify dialog (GET /api/tasks/:id).
 * Same as list item but keeps the full `classificationAssociations`
 * array so the classify dialog can render per-label confidence pills.
 */
export type PublicTaskDetail = Omit<Task, "userId">;

export function toPublicTaskDetail(task: Task): PublicTaskDetail {
  const { userId: _uid, ...rest } = task;
  return rest;
}

/** Wallet row without redundant owner id (caller is always the authenticated user). */
export type PublicWallet = Omit<
  Wallet,
  "userId" | "chipChaseMsTotal" | "chipCatchesCount" | "chipHuntLastSyncAt"
>;

export function toPublicWallet(wallet: Wallet): PublicWallet {
  const {
    userId: _uid,
    chipChaseMsTotal: _chase,
    chipCatchesCount: _catches,
    chipHuntLastSyncAt: _sync,
    ...rest
  } = wallet;
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

/** Badge catalog entry (may include `hidden` before redaction for the client). */
export type BadgeDefinitionInput = {
  name: string;
  description: string;
  icon: string;
  hidden?: boolean;
};

/** Strip spoilers for hidden badges the user has not earned yet. */
export function toPublicBadgeDefinitions(
  definitions: Record<string, BadgeDefinitionInput>,
  earnedBadgeIds: Iterable<string>,
): Record<string, { name: string; description: string; icon: string }> {
  const earned = new Set(earnedBadgeIds);
  const out: Record<string, { name: string; description: string; icon: string }> = {};
  for (const [id, def] of Object.entries(definitions)) {
    if (def.hidden && !earned.has(id)) {
      out[id] = { name: "???", description: "Secret achievement", icon: "❓" };
    } else {
      out[id] = { name: def.name, description: def.description, icon: def.icon };
    }
  }
  return out;
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

// ─── Admin > Storage DTOs ──────────────────────────────────────────────
//
// These shapes are admin-only (/api/admin/db-storage/*). Per
// docs/CLIENT_VISIBLE_PRIVACY.md we explicitly don't ship raw user ids
// back to the SPA — the storage service hashes userId server-side before
// any of these DTOs are constructed, so there's nothing here to strip.
// Admin operators can de-hash via logs if they genuinely need to identify
// a heavy user.

export type PublicStorageDomain =
  | "core"
  | "tasks"
  | "gamification"
  | "ops"
  | "unknown";

export type PublicTableBytesRow = {
  tableName: string;
  domain: PublicStorageDomain;
  totalBytes: number;
  tableBytes: number;
  indexBytes: number;
  toastBytes: number;
  liveRows: number;
  deadRows: number;
};

export type PublicDomainRollupRow = {
  domain: PublicStorageDomain;
  tableCount: number;
  totalBytes: number;
  tableBytes: number;
  indexBytes: number;
  liveRows: number;
};

export type PublicTopUserRow = {
  /** Short hash of the userId; never the raw id. */
  userKey: string;
  bytes: number;
  rowCount: number;
};

export type PublicDbStorageTablesResponse = {
  rows: PublicTableBytesRow[];
  fetchedAt: string;
  source: "live" | "cache";
};

export type PublicDbStorageDomainsResponse = {
  rollup: PublicDomainRollupRow[];
  fetchedAt: string;
  source: "live" | "cache";
};

export type PublicDbStorageTopUsersResponse = {
  kind: "attachments" | "tasks";
  rows: PublicTopUserRow[];
  fetchedAt: string;
};

export type PublicDbSizeHistoryPoint = {
  capturedAt: string;
  dbSizeBytes: number;
  domainBytes: Record<PublicStorageDomain, number>;
};

export type PublicDbSizeHistoryResponse = {
  points: PublicDbSizeHistoryPoint[];
  days: number;
};

export type PublicRetentionPreviewRow = {
  table:
    | "security_events"
    | "security_logs"
    | "usage_snapshots"
    | "password_reset_tokens"
    | "db_size_snapshots";
  cutoff: string;
  rowsToDelete: number;
};

export type PublicRetentionPreviewResponse = {
  rows: PublicRetentionPreviewRow[];
  totalRowsToDelete: number;
  generatedAt: string;
};

export type PublicRetentionRunResponse = {
  securityEventsDeleted: number;
  securityLogsDeleted: number;
  usageSnapshotsDeleted: number;
  passwordResetTokensDeleted: number;
  dbSizeSnapshotsDeleted: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  errors: Array<{ table: string; message: string }>;
};

