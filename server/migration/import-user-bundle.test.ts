import { describe, expect, it } from "vitest";
import { USER_OWNED_TABLES } from "./user-bundle-import-allowlist";

describe("USER_OWNED_TABLES (user JSON import allowlist)", () => {
  it("excludes financial, billing, auth, and audit tables", () => {
    for (const forbidden of [
      "wallets",
      "coinTransactions",
      "userRewards",
      "userBadges",
      "passwordResetTokens",
      "securityLogs",
      "userBillingProfiles",
    ]) {
      expect(USER_OWNED_TABLES.has(forbidden)).toBe(false);
    }
  });

  it("includes core task and collaboration content tables", () => {
    for (const allowed of [
      "tasks",
      "taskPatterns",
      "taskImportFingerprints",
      "attachmentAssets",
      "taskCollaborators",
      "classificationContributions",
      "classificationConfirmations",
    ]) {
      expect(USER_OWNED_TABLES.has(allowed)).toBe(true);
    }
  });
});
