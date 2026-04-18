// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  getAllUsers: vi.fn(),
  getLatestLoginAt: vi.fn(),
  getLatestTaskMutationAt: vi.fn(),
  getOrCreateWallet: vi.fn(),
  getUserAdherenceState: vi.fn(),
  listRecentAdherenceInterventions: vi.fn(),
  createAdherenceIntervention: vi.fn(),
  upsertUserAdherenceState: vi.fn(),
  storage: {
    getTasks: vi.fn(),
  },
}));

vi.mock("../storage", () => storageMocks);

import { evaluateAdherenceForUser } from "./adherence-evaluator";

describe("evaluateAdherenceForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.getLatestLoginAt.mockResolvedValue(new Date());
    storageMocks.getLatestTaskMutationAt.mockResolvedValue(new Date());
    storageMocks.getOrCreateWallet.mockResolvedValue({
      currentStreak: 1,
      longestStreak: 5,
      lastCompletionDate: new Date().toISOString().slice(0, 10),
    });
    storageMocks.getUserAdherenceState.mockResolvedValue(null);
    storageMocks.listRecentAdherenceInterventions.mockResolvedValue([]);
    storageMocks.createAdherenceIntervention.mockResolvedValue({ id: "i1" });
    storageMocks.upsertUserAdherenceState.mockResolvedValue({});
  });

  it("returns no signals when feature disabled", async () => {
    process.env.ADHERENCE_INTERVENTIONS_ENABLED = "false";
    const result = await evaluateAdherenceForUser("u1", "manual");
    expect(result.createdSignals).toEqual([]);
    expect(storageMocks.createAdherenceIntervention).not.toHaveBeenCalled();
  });

  it("creates missed_due_dates signal for overdue pending task", async () => {
    process.env.ADHERENCE_INTERVENTIONS_ENABLED = "true";
    storageMocks.storage.getTasks.mockResolvedValue([
      {
        id: "t1",
        userId: "u1",
        date: "2020-01-01",
        time: "09:00",
        activity: "Old task",
        status: "pending",
      },
    ]);

    const result = await evaluateAdherenceForUser("u1", "manual");
    expect(result.createdSignals).toContain("missed_due_dates");
    expect(storageMocks.createAdherenceIntervention).toHaveBeenCalled();
  });
});

