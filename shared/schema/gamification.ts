// Gamification: wallets, coin transactions, badges, rewards catalog + user
// redemptions, offline-generator state + skill tree, avatar skill tree +
// avatar profile XP. All entries reference `users` from ./core; nothing
// from tasks or ops belongs here.

import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./core";

// ─── Gamification: Wallets ──────────────────────────────────────────────────
export const wallets = pgTable("wallets", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  lifetimeEarned: integer("lifetime_earned").notNull().default(0),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastCompletionDate: text("last_completion_date"),
  comboCount: integer("combo_count").notNull().default(0),
  bestComboCount: integer("best_combo_count").notNull().default(0),
  comboWindowStartedAt: timestamp("combo_window_started_at"),
  lastCompletionAt: timestamp("last_completion_at"),
  chainCount24h: integer("chain_count_24h").notNull().default(0),
  bestChainCount24h: integer("best_chain_count_24h").notNull().default(0),
});

export type Wallet = typeof wallets.$inferSelect;

// ─── Gamification: Coin Transactions ────────────────────────────────────────
export const coinTransactions = pgTable("coin_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  details: text("details"),
  taskId: varchar("task_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_coin_tx_user").on(table.userId),
  index("idx_coin_tx_created").on(table.createdAt),
  index("idx_coin_tx_task").on(table.taskId),
]);

export type CoinTransaction = typeof coinTransactions.$inferSelect;

// ─── Gamification: User Badges ──────────────────────────────────────────────
export const userBadges = pgTable("user_badges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  badgeId: text("badge_id").notNull(),
  earnedAt: timestamp("earned_at").defaultNow(),
}, (table) => [
  index("idx_user_badges_user").on(table.userId),
]);

export type UserBadge = typeof userBadges.$inferSelect;

// ─── Gamification: Rewards Catalog ──────────────────────────────────────────
export const rewardsCatalog = pgTable("rewards_catalog", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").notNull(),
  cost: integer("cost").notNull(),
  /** When set, any avatar profile at or above this level can redeem without spending coins. */
  unlockAtAvatarLevel: integer("unlock_at_avatar_level"),
  type: text("type").notNull(),
  icon: text("icon"),
  data: text("data"),
});

export type RewardItem = typeof rewardsCatalog.$inferSelect;

// ─── Gamification: User Redeemed Rewards ────────────────────────────────────
export const userRewards = pgTable("user_rewards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rewardId: varchar("reward_id").notNull().references(() => rewardsCatalog.id),
  redeemedAt: timestamp("redeemed_at").defaultNow(),
  isActive: boolean("is_active").notNull().default(true),
  /** Coins paid when redeeming from catalog; 0 for avatar-level unlocks. Used for sell-back refunds. */
  coinsSpentAtRedeem: integer("coins_spent_at_redeem").notNull().default(0),
}, (table) => [
  index("idx_user_rewards_user").on(table.userId),
]);

export type UserReward = typeof userRewards.$inferSelect;

// ─── Gamification: Offline Generator ─────────────────────────────────────────
export const offlineGenerators = pgTable("offline_generators", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  isOwned: boolean("is_owned").notNull().default(false),
  level: integer("level").notNull().default(0),
  baseRatePerHour: integer("base_rate_per_hour").notNull().default(0),
  baseCapacityHours: integer("base_capacity_hours").notNull().default(12),
  lastClaimAt: timestamp("last_claim_at"),
  totalGenerated: integer("total_generated").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type OfflineGenerator = typeof offlineGenerators.$inferSelect;

export const offlineSkillNodes = pgTable("offline_skill_nodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  skillKey: text("skill_key").notNull().unique("offline_skill_nodes_skill_key_unique"),
  name: text("name").notNull(),
  description: text("description").notNull(),
  branch: text("branch").notNull(),
  maxLevel: integer("max_level").notNull().default(1),
  baseCost: integer("base_cost").notNull().default(100),
  effectType: text("effect_type").notNull(),
  effectPerLevel: integer("effect_per_level").notNull().default(0),
  prerequisiteSkillKey: text("prerequisite_skill_key"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_offline_skill_nodes_branch").on(table.branch),
  index("idx_offline_skill_nodes_sort").on(table.sortOrder),
]);

export type OfflineSkillNode = typeof offlineSkillNodes.$inferSelect;

export const userOfflineSkills = pgTable("user_offline_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  skillNodeId: varchar("skill_node_id").notNull().references(() => offlineSkillNodes.id, { onDelete: "cascade" }),
  level: integer("level").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("ux_user_offline_skills_user_node").on(table.userId, table.skillNodeId),
  index("idx_user_offline_skills_user").on(table.userId),
]);

export type UserOfflineSkill = typeof userOfflineSkills.$inferSelect;

export const avatarSkillNodes = pgTable("avatar_skill_nodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  skillKey: text("skill_key").notNull().unique("avatar_skill_nodes_skill_key_unique"),
  name: text("name").notNull(),
  description: text("description").notNull(),
  branch: text("branch").notNull(),
  maxLevel: integer("max_level").notNull().default(1),
  baseCost: integer("base_cost").notNull().default(100),
  effectType: text("effect_type").notNull(),
  effectPerLevel: integer("effect_per_level").notNull().default(0),
  prerequisiteSkillKey: text("prerequisite_skill_key"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_avatar_skill_nodes_branch").on(table.branch),
  index("idx_avatar_skill_nodes_sort").on(table.sortOrder),
]);

export type AvatarSkillNode = typeof avatarSkillNodes.$inferSelect;

export const userAvatarSkills = pgTable("user_avatar_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  skillNodeId: varchar("skill_node_id").notNull().references(() => avatarSkillNodes.id, { onDelete: "cascade" }),
  level: integer("level").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("ux_user_avatar_skills_user_node").on(table.userId, table.skillNodeId),
  index("idx_user_avatar_skills_user").on(table.userId),
]);

export type UserAvatarSkill = typeof userAvatarSkills.$inferSelect;

export const userAvatarProfiles = pgTable("user_avatar_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  avatarKey: text("avatar_key").notNull(),
  displayName: text("display_name").notNull(),
  archetypeKey: text("archetype_key").notNull(),
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  totalXp: integer("total_xp").notNull().default(0),
  mission: text("mission").notNull().default("Complete a task to gain XP."),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("ux_user_avatar_profiles_user_avatar").on(table.userId, table.avatarKey),
  index("idx_user_avatar_profiles_user").on(table.userId),
]);

export type UserAvatarProfile = typeof userAvatarProfiles.$inferSelect;
