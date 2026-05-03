import { describe, expect, it } from "vitest";
import { MFA_PURPOSES } from "@shared/mfa-purposes";
import { shouldPersistMfaEmailHandoff } from "./mfa-handoff";

describe("shouldPersistMfaEmailHandoff", () => {
  it("allows non-admin MFA purposes regardless of role or loading", () => {
    expect(
      shouldPersistMfaEmailHandoff(MFA_PURPOSES.ACCOUNT_DATA_EXPORT, {
        userRole: undefined,
        authLoading: true,
      }),
    ).toBe(true);
    expect(
      shouldPersistMfaEmailHandoff(MFA_PURPOSES.COMMUNITY_PUBLISH_TASK, {
        userRole: "user",
        authLoading: false,
      }),
    ).toBe(true);
  });

  it("defers admin step-up while auth is loading", () => {
    expect(
      shouldPersistMfaEmailHandoff(MFA_PURPOSES.ADMIN_STEP_UP, {
        userRole: "admin",
        authLoading: true,
      }),
    ).toBe(false);
  });

  it("refuses admin step-up when signed out", () => {
    expect(
      shouldPersistMfaEmailHandoff(MFA_PURPOSES.ADMIN_STEP_UP, {
        userRole: undefined,
        authLoading: false,
      }),
    ).toBe(false);
  });

  it("refuses admin step-up for non-admin users", () => {
    expect(
      shouldPersistMfaEmailHandoff(MFA_PURPOSES.ADMIN_STEP_UP, {
        userRole: "user",
        authLoading: false,
      }),
    ).toBe(false);
  });

  it("allows admin step-up only for admins after auth settled", () => {
    expect(
      shouldPersistMfaEmailHandoff(MFA_PURPOSES.ADMIN_STEP_UP, {
        userRole: "admin",
        authLoading: false,
      }),
    ).toBe(true);
  });
});
