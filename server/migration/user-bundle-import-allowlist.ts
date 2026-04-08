/**
 * Tables restorable from self-service user JSON import (`importUserBundle`).
 * Financial, billing, auth, and audit tables are excluded — they may appear in exports but must not be restored from client bundles.
 */
export const USER_OWNED_TABLES = new Set<string>([
  "tasks",
  "taskPatterns",
  "taskImportFingerprints",
  "attachmentAssets",
  "userClassificationCategories",
  "userEntourage",
  "avatarProfiles",
  "taskCollaborators",
  "classificationContributions",
  "classificationConfirmations",
]);
