import { describe, expect, it } from "vitest";
import type { CoinTransaction, UserBadge } from "./schema";
import {
  toPublicBadge,
  toPublicBadgeDefinitions,
  toPublicCoinTransaction,
  toPublicSessionUser,
  toPublicWallet,
  toPublicArchetypePollSummary,
  toPublicInviteUserPreview,
} from "./public-client-dtos";
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

  it("redacts hidden badge definitions until earned", () => {
    const defs = {
      pub: { name: "Public", description: "Hi", icon: "a" },
      sec: { name: "Secret", description: "X", icon: "b", hidden: true },
    };
    const out = toPublicBadgeDefinitions(defs, new Set(["pub"]));
    expect(out.pub.name).toBe("Public");
    expect(out.sec.name).toBe("???");
    expect(out.sec.description).toBe("Secret achievement");
  });

  it("drops wallet userId and chip hunt internals", () => {
    const w = toPublicWallet({
      userId: "u1",
      balance: 3,
      lifetimeEarned: 10,
      currentStreak: 1,
      longestStreak: 2,
      lastCompletionDate: "2026-01-01",
      comboCount: 0,
      bestComboCount: 0,
      comboWindowStartedAt: null,
      lastCompletionAt: null,
      chainCount24h: 0,
      bestChainCount24h: 0,
      chipChaseMsTotal: 999,
      chipCatchesCount: 1,
      chipHuntLastSyncAt: new Date(),
    });
    expect(w).not.toHaveProperty("userId");
    expect(w).not.toHaveProperty("chipChaseMsTotal");
    expect(w).not.toHaveProperty("chipCatchesCount");
    expect(w).not.toHaveProperty("chipHuntLastSyncAt");
    expect(w.balance).toBe(3);
  });

  it("archetype poll summary exposes voting and results flags from timestamps", () => {
    const opens = new Date("2026-01-10T12:00:00.000Z");
    const closes = new Date("2026-01-17T12:00:00.000Z");
    const mid = new Date("2026-01-14T12:00:00.000Z");
    const s = toPublicArchetypePollSummary(
      {
        id: "p1",
        title: "Q",
        body: null,
        opensAt: opens,
        closesAt: closes,
        authorAvatarKey: "mood",
      },
      mid,
    );
    expect(s.votingOpen).toBe(true);
    expect(s.resultsAvailable).toBe(false);
    const after = toPublicArchetypePollSummary(
      {
        id: "p1",
        title: "Q",
        body: null,
        opensAt: opens,
        closesAt: closes,
        authorAvatarKey: "mood",
      },
      new Date("2026-01-20T12:00:00.000Z"),
    );
    expect(after.votingOpen).toBe(false);
    expect(after.resultsAvailable).toBe(true);
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

  it("strips badge userId for public responses", () => {
    const badge = {
      id: "b1",
      userId: "u1",
      badgeId: "first-task",
      earnedAt: new Date(),
    } as UserBadge;
    const pub = toPublicBadge(badge);
    expect(pub).not.toHaveProperty("userId");
    expect(pub.badgeId).toBe("first-task");
  });

  it("returns only safe fields for invite preview", () => {
    const pub = toPublicInviteUserPreview({
      publicHandle: "axfriend",
      displayName: "Ax Friend",
      profileImageUrl: "https://cdn.example/avatar.png",
    });
    expect(pub).toEqual({
      publicHandle: "axfriend",
      displayName: "Ax Friend",
      profileImageUrl: "https://cdn.example/avatar.png",
    });
    expect(pub).not.toHaveProperty("email");
    expect(pub).not.toHaveProperty("id");
  });
});
