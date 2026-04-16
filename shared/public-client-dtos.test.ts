import { describe, expect, it } from "vitest";
import type { CoinTransaction } from "./schema";
import { toPublicCoinTransaction, toPublicSessionUser, toPublicWallet } from "./public-client-dtos";
import type { SafeUser } from "./schema";

const safeUser = (over: Partial<SafeUser> = {}): SafeUser =>
  ({
    id: "u1",
    email: "a@b.co",
    displayName: "A",
    role: "user",
    authProvider: "local",
    profileImageUrl: null,
    securityQuestion: "What is your mother's maiden name?",
    phoneMasked: null,
    phoneVerified: false,
    totpEnabled: false,
    createdAt: new Date(),
    isBanned: false,
    banReason: "spam",
    bannedAt: new Date(),
    bannedBy: "admin1",
    ...over,
  }) as SafeUser;

describe("public client DTOs", () => {
  it("strips security and moderation fields from session user", () => {
    const pub = toPublicSessionUser(safeUser());
    expect(pub).not.toHaveProperty("securityQuestion");
    expect(pub).not.toHaveProperty("banReason");
    expect(pub).not.toHaveProperty("bannedBy");
    expect(pub).not.toHaveProperty("bannedAt");
    expect(pub.email).toBe("a@b.co");
    expect(pub.id).toBe("u1");
  });

  it("drops wallet userId", () => {
    const w = toPublicWallet({
      userId: "u1",
      balance: 3,
      lifetimeEarned: 10,
      currentStreak: 1,
      longestStreak: 2,
      lastCompletionDate: "2026-01-01",
    });
    expect(w).not.toHaveProperty("userId");
    expect(w.balance).toBe(3);
  });

  it("redacts sensitive coin transaction details", () => {
    const row = {
      id: "t1",
      userId: "u1",
      amount: -5,
      reason: "billing_adjustment",
      details: "Payment confirmed: SECRET-REF-999",
      taskId: null,
      createdAt: new Date(),
    } as CoinTransaction;
    const pub = toPublicCoinTransaction(row);
    expect(pub.details).toBeNull();
    expect(pub).not.toHaveProperty("userId");
  });

  it("keeps benign gamification details", () => {
    const row = {
      id: "t2",
      userId: "u1",
      amount: 1,
      reason: "task_search_reward",
      details: "Search: hello world",
      taskId: null,
      createdAt: new Date(),
    } as CoinTransaction;
    const pub = toPublicCoinTransaction(row);
    expect(pub.details).toContain("Search:");
  });
});
