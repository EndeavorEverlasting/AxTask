import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SafeUser } from "@shared/schema";
import { MFA_PURPOSES } from "@shared/mfa-purposes";

vi.mock("./storage", () => ({
  getUserById: vi.fn(),
  isTaskOwner: vi.fn(),
}));

import * as storage from "./storage";
import { assertMfaChallengeCreateAllowed } from "./mfa-purpose-validation";

describe("assertMfaChallengeCreateAllowed", () => {
  beforeEach(() => {
    vi.mocked(storage.getUserById).mockReset();
    vi.mocked(storage.isTaskOwner).mockReset();
  });

  it("allows admin step-up for admin users", async () => {
    vi.mocked(storage.getUserById).mockResolvedValue({ id: "u1", role: "admin" } as SafeUser);
    await expect(
      assertMfaChallengeCreateAllowed("u1", MFA_PURPOSES.ADMIN_STEP_UP, {}),
    ).resolves.toBeUndefined();
  });

  it("rejects admin step-up for non-admins", async () => {
    vi.mocked(storage.getUserById).mockResolvedValue({ id: "u1", role: "user" } as SafeUser);
    await expect(assertMfaChallengeCreateAllowed("u1", MFA_PURPOSES.ADMIN_STEP_UP, {})).rejects.toThrow(
      /administrators/,
    );
  });

  it("rejects community MFA without taskId", async () => {
    await expect(
      assertMfaChallengeCreateAllowed("u1", MFA_PURPOSES.COMMUNITY_PUBLISH_TASK, {}),
    ).rejects.toThrow(/taskId is required/);
  });

  it("rejects community MFA when caller is not task owner", async () => {
    vi.mocked(storage.isTaskOwner).mockResolvedValue(false);
    await expect(
      assertMfaChallengeCreateAllowed("u1", MFA_PURPOSES.COMMUNITY_UNPUBLISH_TASK, { taskId: "t1" }),
    ).rejects.toThrow(/owner/);
  });

  it("allows community MFA for task owner", async () => {
    vi.mocked(storage.isTaskOwner).mockResolvedValue(true);
    await expect(
      assertMfaChallengeCreateAllowed("u1", MFA_PURPOSES.COMMUNITY_PUBLISH_TASK, { taskId: "t1" }),
    ).resolves.toBeUndefined();
  });
});
