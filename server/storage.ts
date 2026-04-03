import { tasks, users, passwordResetTokens, securityLogs, wallets, coinTransactions, userBadges, rewardsCatalog, userRewards, usageSnapshots, storagePolicies, attachmentAssets, taskImportFingerprints, invoices, invoiceEvents, mfaChallenges, idempotencyKeys, type Task, type InsertTask, type UpdateTask, type User, type SafeUser, type SecurityLog, type Wallet, type CoinTransaction, type UserBadge, type RewardItem, type UsageSnapshot, type StoragePolicy, type AttachmentAsset, type Invoice, type InvoiceEvent } from "@shared/schema";
import { db } from "./db";
import { eq, and, ilike, or, asc, lt, count, avg, sql, desc } from "drizzle-orm";
import { randomUUID, randomBytes, createHash } from "crypto";
import bcrypt from "bcrypt";

// ─── User helpers ────────────────────────────────────────────────────────────

function toSafeUser(user: User): SafeUser {
  const { passwordHash, securityAnswerHash, failedLoginAttempts, lockedUntil, workosId, googleId, replitId, ...safe } = user;
  return safe;
}

export async function createUser(
  email: string,
  password: string,
  displayName?: string,
  role?: "admin" | "user"
): Promise<SafeUser> {
  const id = randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(users)
    .values({
      id,
      email: email.toLowerCase(),
      passwordHash,
      displayName,
      authProvider: "local",
      ...(role ? { role } : {}),
    })
    .returning();
  return toSafeUser(user);
}

/**
 * Find or create a user from an OAuth provider (WorkOS or Google).
 * If a user with the same email exists, link the provider ID and return them.
 * If not, create a new user with no password.
 */
export async function findOrCreateOAuthUser(opts: {
  email: string;
  displayName?: string;
  profileImageUrl?: string;
  provider: "workos" | "google" | "replit";
  providerId: string;
}): Promise<SafeUser> {
  const { email, displayName, profileImageUrl, provider, providerId } = opts;
  const normalizedEmail = email.toLowerCase();

  // Check if already linked by provider ID
  const providerCol =
    provider === "workos" ? users.workosId :
    provider === "replit" ? users.replitId :
    users.googleId;
  const [existingByProvider] = await db
    .select().from(users)
    .where(eq(providerCol, providerId));
  if (existingByProvider) {
    const updateData: Record<string, any> = {};
    if (displayName && displayName !== existingByProvider.displayName) updateData.displayName = displayName;
    if (profileImageUrl && profileImageUrl !== existingByProvider.profileImageUrl) updateData.profileImageUrl = profileImageUrl;
    if (Object.keys(updateData).length > 0) {
      await db.update(users).set(updateData).where(eq(users.id, existingByProvider.id));
      Object.assign(existingByProvider, updateData);
    }
    return toSafeUser(existingByProvider);
  }

  // Check if a user with this email already exists (link the provider)
  const existingByEmail = await getUserByEmail(normalizedEmail);
  if (existingByEmail) {
    const updateData: Record<string, any> = {};
    if (provider === "workos") updateData.workosId = providerId;
    else if (provider === "replit") updateData.replitId = providerId;
    else updateData.googleId = providerId;
    if (displayName && !existingByEmail.displayName) updateData.displayName = displayName;
    if (profileImageUrl && !existingByEmail.profileImageUrl) updateData.profileImageUrl = profileImageUrl;
    await db.update(users).set(updateData).where(eq(users.id, existingByEmail.id));
    return toSafeUser({ ...existingByEmail, ...updateData });
  }

  // Create new OAuth user (no password)
  const id = randomUUID();
  const providerIdMap: Record<string, string> = {};
  if (provider === "workos") providerIdMap.workosId = providerId;
  else if (provider === "replit") providerIdMap.replitId = providerId;
  else providerIdMap.googleId = providerId;
  const [user] = await db
    .insert(users)
    .values({
      id,
      email: normalizedEmail,
      passwordHash: null,
      displayName: displayName || normalizedEmail.split("@")[0],
      authProvider: provider,
      profileImageUrl: profileImageUrl || null,
      ...providerIdMap,
    })
    .returning();
  return toSafeUser(user);
}

/**
 * DEV ONLY — rotate a user's password. Exported only for seed-dev.ts.
 * Never call this from a route handler.
 */
export async function resetPasswordForDev(
  email: string,
  newPassword: string
): Promise<void> {
  const hash = await bcrypt.hash(newPassword, 12);
  await db
    .update(users)
    .set({ passwordHash: hash, failedLoginAttempts: 0, lockedUntil: null })
    .where(eq(users.email, email.toLowerCase()));
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()));
  return user || undefined;
}

export async function getUserById(id: string): Promise<SafeUser | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ? toSafeUser(user) : undefined;
}

export async function verifyPassword(
  plaintext: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

// ─── Account lockout ────────────────────────────────────────────────────────

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function recordFailedLogin(email: string, ipAddress?: string): Promise<void> {
  const user = await getUserByEmail(email);
  if (!user) return;

  const attempts = (user.failedLoginAttempts ?? 0) + 1;
  const update: Record<string, unknown> = { failedLoginAttempts: attempts };

  if (attempts >= MAX_FAILED_ATTEMPTS) {
    update.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
    console.warn(`[SECURITY] Account locked: ${email} after ${attempts} failed attempts`);
    await logSecurityEvent("account_locked", user.id, undefined, ipAddress, `Account locked after ${attempts} failed attempts`);
  }

  await db
    .update(users)
    .set(update)
    .where(eq(users.email, email.toLowerCase()));
}

export async function resetFailedLogins(email: string): Promise<void> {
  await db
    .update(users)
    .set({ failedLoginAttempts: 0, lockedUntil: null })
    .where(eq(users.email, email.toLowerCase()));
}

// ─── Security Question ──────────────────────────────────────────────────────

export async function setSecurityQuestion(
  userId: string,
  question: string,
  answer: string
): Promise<void> {
  const answerHash = await bcrypt.hash(answer.trim().toLowerCase(), 12);
  await db
    .update(users)
    .set({ securityQuestion: question, securityAnswerHash: answerHash })
    .where(eq(users.id, userId));
}

export async function getSecurityQuestion(email: string): Promise<string | null> {
  const user = await getUserByEmail(email);
  return user?.securityQuestion || null;
}

export async function verifySecurityAnswer(
  email: string,
  answer: string
): Promise<boolean> {
  const user = await getUserByEmail(email);
  if (!user?.securityAnswerHash) return false;
  return bcrypt.compare(answer.trim().toLowerCase(), user.securityAnswerHash);
}

// ─── Password Reset Tokens ──────────────────────────────────────────────────

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Create a password reset token. Returns the raw token (to send via email or return to client).
 * Only the SHA-256 hash is stored in the database.
 */
export async function createResetToken(
  email: string,
  method: "email" | "security_question" | "admin" = "email",
  expiresInMinutes = 30
): Promise<{ token: string; expiresAt: Date } | null> {
  const user = await getUserByEmail(email);
  if (!user) return null;

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  await db.insert(passwordResetTokens).values({
    id: randomUUID(),
    userId: user.id,
    tokenHash,
    method,
    expiresAt,
  });

  return { token: rawToken, expiresAt };
}

/**
 * Verify a reset token is valid (exists, not used, not expired).
 * Does NOT consume it — call consumeResetToken after password change.
 */
export async function verifyResetToken(
  token: string
): Promise<{ userId: string; method: string } | null> {
  const tokenHash = hashToken(token);
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash));

  if (!row) return null;
  if (row.usedAt) return null;
  if (new Date(row.expiresAt) < new Date()) return null;

  return { userId: row.userId, method: row.method };
}

/**
 * Consume a reset token (mark as used) and change the user's password.
 */
export async function consumeResetToken(
  token: string,
  newPassword: string
): Promise<boolean> {
  const valid = await verifyResetToken(token);
  if (!valid) return false;

  const tokenHash = hashToken(token);
  const passwordHash = await bcrypt.hash(newPassword, 12);

  // Mark token as used
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.tokenHash, tokenHash));

  // Update password + reset lockout
  await db
    .update(users)
    .set({ passwordHash, failedLoginAttempts: 0, lockedUntil: null })
    .where(eq(users.id, valid.userId));

  return true;
}

/**
 * Admin reset — directly set a user's password. Caller must verify admin role.
 */
export async function adminResetPassword(
  targetEmail: string,
  newPassword: string
): Promise<boolean> {
  const user = await getUserByEmail(targetEmail);
  if (!user) return false;

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db
    .update(users)
    .set({ passwordHash, failedLoginAttempts: 0, lockedUntil: null })
    .where(eq(users.id, user.id));

  // Log for audit
  console.log(`[ADMIN] Password reset for ${targetEmail}`);
  return true;
}

/**
 * Clean up expired/used tokens older than 24 hours.
 */
export async function cleanupExpiredTokens(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db
    .delete(passwordResetTokens)
    .where(lt(passwordResetTokens.expiresAt, cutoff));
}

// ─── Ban / Unban ────────────────────────────────────────────────────────────

export async function banUser(
  targetUserId: string,
  bannedByUserId: string,
  reason: string,
  ipAddress?: string
): Promise<boolean> {
  const [user] = await db.select().from(users).where(eq(users.id, targetUserId));
  if (!user) return false;
  if (user.role === "admin") return false;

  await db
    .update(users)
    .set({
      isBanned: true,
      banReason: reason,
      bannedAt: new Date(),
      bannedBy: bannedByUserId,
    })
    .where(eq(users.id, targetUserId));

  await logSecurityEvent("user_banned", bannedByUserId, targetUserId, ipAddress, reason);
  return true;
}

export async function unbanUser(
  targetUserId: string,
  unbannedByUserId: string,
  ipAddress?: string
): Promise<boolean> {
  const [user] = await db.select().from(users).where(eq(users.id, targetUserId));
  if (!user) return false;

  await db
    .update(users)
    .set({
      isBanned: false,
      banReason: null,
      bannedAt: null,
      bannedBy: null,
    })
    .where(eq(users.id, targetUserId));

  await logSecurityEvent("user_unbanned", unbannedByUserId, targetUserId, ipAddress);
  return true;
}

export async function getAllUsers(): Promise<SafeUser[]> {
  const rows = await db.select().from(users).orderBy(asc(users.createdAt));
  return rows.map(toSafeUser);
}

export async function isUserBanned(email: string): Promise<{ banned: boolean; reason?: string }> {
  const user = await getUserByEmail(email);
  if (!user) return { banned: false };
  if (user.isBanned) return { banned: true, reason: user.banReason || undefined };
  return { banned: false };
}

// ─── Security Audit Logging ─────────────────────────────────────────────────

export async function logSecurityEvent(
  eventType: string,
  userId?: string,
  targetUserId?: string,
  ipAddress?: string,
  details?: string
): Promise<void> {
  await db.insert(securityLogs).values({
    id: randomUUID(),
    eventType,
    userId: userId || null,
    targetUserId: targetUserId || null,
    ipAddress: ipAddress || null,
    details: details || null,
  });
}

export async function getSecurityLogs(limit = 100): Promise<SecurityLog[]> {
  return db
    .select()
    .from(securityLogs)
    .orderBy(desc(securityLogs.createdAt))
    .limit(limit);
}

// ─── Task storage ────────────────────────────────────────────────────────────

export interface IStorage {
  getTasks(userId: string): Promise<Task[]>;
  getTask(userId: string, id: string): Promise<Task | undefined>;
  createTask(userId: string, task: InsertTask): Promise<Task>;
  updateTask(userId: string, task: UpdateTask): Promise<Task | undefined>;
  deleteTask(userId: string, id: string): Promise<boolean>;
  getTasksByStatus(userId: string, status: string): Promise<Task[]>;
  getTasksByPriority(userId: string, priority: string): Promise<Task[]>;
  searchTasks(userId: string, query: string): Promise<Task[]>;
  createTasksBulk(userId: string, taskList: InsertTask[]): Promise<Task[]>;
  bulkUpdateTasks(userId: string, updates: UpdateTask[]): Promise<void>;
  reorderTasks(userId: string, taskIds: string[]): Promise<void>;
  getTaskStats(userId: string): Promise<{
    totalTasks: number;
    highPriorityTasks: number;
    completedToday: number;
    avgPriorityScore: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getTasks(userId: string): Promise<Task[]> {
    return await db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId))
      .orderBy(asc(tasks.sortOrder));
  }

  async getTask(userId: string, id: string): Promise<Task | undefined> {
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    return task || undefined;
  }

  async createTask(userId: string, insertTask: InsertTask): Promise<Task> {
    const id = randomUUID();
    const now = new Date();

    const taskData = {
      ...insertTask,
      id,
      userId,
      priority: "Low",
      priorityScore: 0,
      classification: "General",
      isRepeated: false,
      createdAt: now,
      updatedAt: now,
    };

    const [task] = await db.insert(tasks).values(taskData).returning();
    return task;
  }

  async createTasksBulk(userId: string, taskList: InsertTask[]): Promise<Task[]> {
    if (taskList.length === 0) return [];
    const now = new Date();
    const BATCH_SIZE = 500;
    const allInserted: Task[] = [];

    for (let i = 0; i < taskList.length; i += BATCH_SIZE) {
      const batch = taskList.slice(i, i + BATCH_SIZE);
      const values = batch.map((t) => ({
        ...t,
        id: randomUUID(),
        userId,
        priority: "Low",
        priorityScore: 0,
        classification: "General",
        isRepeated: false,
        createdAt: now,
        updatedAt: now,
      }));
      const inserted = await db.insert(tasks).values(values).returning();
      allInserted.push(...inserted);
    }
    return allInserted;
  }

  async updateTask(userId: string, updateTask: UpdateTask): Promise<Task | undefined> {
    const [task] = await db
      .update(tasks)
      .set({ ...updateTask, updatedAt: new Date() })
      .where(and(eq(tasks.id, updateTask.id), eq(tasks.userId, userId)))
      .returning();
    return task || undefined;
  }

  async deleteTask(userId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
    return (result.rowCount || 0) > 0;
  }

  async getTasksByStatus(userId: string, status: string): Promise<Task[]> {
    return await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.status, status)));
  }

  async getTasksByPriority(userId: string, priority: string): Promise<Task[]> {
    return await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.priority, priority)));
  }

  async searchTasks(userId: string, query: string): Promise<Task[]> {
    const lowercaseQuery = `%${query.toLowerCase()}%`;
    return await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          or(
            ilike(tasks.activity, lowercaseQuery),
            ilike(tasks.notes, lowercaseQuery),
            ilike(tasks.classification, lowercaseQuery)
          )
        )
      );
  }

  async bulkUpdateTasks(userId: string, updates: UpdateTask[]): Promise<void> {
    if (updates.length === 0) return;
    const now = new Date();
    const BATCH = 500;

    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);

      const buildCase = (column: string, getValue: (u: UpdateTask) => any | undefined) => {
        const parts = batch.map(u => {
          const val = getValue(u);
          if (val === undefined) return sql`WHEN id = ${u.id} THEN ${sql.raw(column)}`;
          return sql`WHEN id = ${u.id} THEN ${val}`;
        });
        return sql.join([sql`CASE`, ...parts, sql`ELSE ${sql.raw(column)} END`], sql` `);
      };

      const idParams = batch.map(u => sql`${u.id}`);

      await db.execute(sql`
        UPDATE tasks SET
          priority = ${buildCase('priority', u => u.priority)},
          priority_score = ${buildCase('priority_score', u => u.priorityScore)},
          classification = ${buildCase('classification', u => u.classification)},
          is_repeated = ${buildCase('is_repeated', u => u.isRepeated)},
          updated_at = ${now}
        WHERE user_id = ${userId} AND id IN (${sql.join(idParams, sql`, `)})
      `);
    }
  }

  async reorderTasks(userId: string, taskIds: string[]): Promise<void> {
    const now = new Date();
    const BATCH = 500;
    for (let i = 0; i < taskIds.length; i += BATCH) {
      const batch = taskIds.slice(i, i + BATCH);
      await Promise.all(
        batch.map((id, idx) =>
          db
            .update(tasks)
            .set({ sortOrder: i + idx, updatedAt: now })
            .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
        )
      );
    }
  }

  async getTaskStats(userId: string): Promise<{
    totalTasks: number;
    highPriorityTasks: number;
    completedToday: number;
    avgPriorityScore: number;
  }> {
    const today = new Date().toISOString().split("T")[0];

    const [[totalRow], [highPriorityRow], [completedTodayRow], [avgRow]] = await Promise.all([
      db.select({ value: count() }).from(tasks).where(eq(tasks.userId, userId)),
      db.select({ value: count() }).from(tasks).where(
        and(
          eq(tasks.userId, userId),
          or(eq(tasks.priority, "Highest"), eq(tasks.priority, "High"))
        )
      ),
      db.select({ value: count() }).from(tasks).where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.status, "completed"),
          sql`${tasks.updatedAt}::date = ${today}::date`
        )
      ),
      db.select({ value: avg(tasks.priorityScore) }).from(tasks).where(eq(tasks.userId, userId)),
    ]);

    return {
      totalTasks: Number(totalRow?.value) || 0,
      highPriorityTasks: Number(highPriorityRow?.value) || 0,
      completedToday: Number(completedTodayRow?.value) || 0,
      avgPriorityScore: Number(avgRow?.value) || 0,
    };
  }
}

export const storage = new DatabaseStorage();

// ─── Gamification Storage ────────────────────────────────────────────────────

export async function getOrCreateWallet(userId: string): Promise<Wallet> {
  const [existing] = await db.select().from(wallets).where(eq(wallets.userId, userId));
  if (existing) return existing;
  const [wallet] = await db.insert(wallets).values({ userId }).returning();
  return wallet;
}

export async function addCoins(
  userId: string,
  amount: number,
  reason: string,
  details?: string,
  taskId?: string
): Promise<{ wallet: Wallet; transaction: CoinTransaction }> {
  const wallet = await getOrCreateWallet(userId);
  const [updated] = await db
    .update(wallets)
    .set({
      balance: wallet.balance + amount,
      lifetimeEarned: wallet.lifetimeEarned + amount,
    })
    .where(eq(wallets.userId, userId))
    .returning();
  const [transaction] = await db
    .insert(coinTransactions)
    .values({ id: randomUUID(), userId, amount, reason, details, taskId })
    .returning();
  return { wallet: updated, transaction };
}

export async function hasTaskBeenAwarded(userId: string, taskId: string): Promise<boolean> {
  const [row] = await db
    .select({ value: count() })
    .from(coinTransactions)
    .where(and(
      eq(coinTransactions.userId, userId),
      eq(coinTransactions.taskId, taskId),
      eq(coinTransactions.reason, "task_completion")
    ));
  return (Number(row?.value) || 0) > 0;
}

export async function spendCoins(userId: string, amount: number, reason: string): Promise<Wallet | null> {
  const wallet = await getOrCreateWallet(userId);
  if (wallet.balance < amount) return null;
  const [updated] = await db
    .update(wallets)
    .set({ balance: wallet.balance - amount })
    .where(eq(wallets.userId, userId))
    .returning();
  await db.insert(coinTransactions).values({ id: randomUUID(), userId, amount: -amount, reason });
  return updated;
}

export async function getTransactions(userId: string, limit = 50): Promise<CoinTransaction[]> {
  return db
    .select()
    .from(coinTransactions)
    .where(eq(coinTransactions.userId, userId))
    .orderBy(desc(coinTransactions.createdAt))
    .limit(limit);
}

export async function updateStreak(userId: string): Promise<Wallet> {
  const wallet = await getOrCreateWallet(userId);
  const today = new Date().toISOString().split("T")[0];

  if (wallet.lastCompletionDate === today) return wallet;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  let newStreak = 1;
  if (wallet.lastCompletionDate === yesterdayStr) {
    newStreak = wallet.currentStreak + 1;
  }

  const longestStreak = Math.max(wallet.longestStreak, newStreak);

  const [updated] = await db
    .update(wallets)
    .set({ currentStreak: newStreak, longestStreak, lastCompletionDate: today })
    .where(eq(wallets.userId, userId))
    .returning();
  return updated;
}

export async function getUserBadges(userId: string): Promise<UserBadge[]> {
  return db.select().from(userBadges).where(eq(userBadges.userId, userId)).orderBy(desc(userBadges.earnedAt));
}

export async function awardBadge(userId: string, badgeId: string): Promise<UserBadge | null> {
  const existing = await db
    .select()
    .from(userBadges)
    .where(and(eq(userBadges.userId, userId), eq(userBadges.badgeId, badgeId)));
  if (existing.length > 0) return null;
  const [badge] = await db.insert(userBadges).values({ id: randomUUID(), userId, badgeId }).returning();
  return badge;
}

export async function getRewardsCatalog(): Promise<RewardItem[]> {
  return db.select().from(rewardsCatalog);
}

export async function getRewardById(id: string): Promise<RewardItem | undefined> {
  const [item] = await db.select().from(rewardsCatalog).where(eq(rewardsCatalog.id, id));
  return item;
}

export async function getUserRewards(userId: string): Promise<(typeof userRewards.$inferSelect)[]> {
  return db.select().from(userRewards).where(eq(userRewards.userId, userId)).orderBy(desc(userRewards.redeemedAt));
}

export async function redeemReward(userId: string, rewardId: string): Promise<boolean> {
  const reward = await getRewardById(rewardId);
  if (!reward) return false;
  const [existing] = await db
    .select({ value: count() })
    .from(userRewards)
    .where(and(eq(userRewards.userId, userId), eq(userRewards.rewardId, rewardId)));
  if ((Number(existing?.value) || 0) > 0) return false;
  const wallet = await spendCoins(userId, reward.cost, `Redeemed: ${reward.name}`);
  if (!wallet) return false;
  await db.insert(userRewards).values({ id: randomUUID(), userId, rewardId });
  return true;
}

export async function seedRewardsCatalog(): Promise<void> {
  const existing = await db.select().from(rewardsCatalog);
  if (existing.length > 0) return;
  await db.insert(rewardsCatalog).values([
    { id: randomUUID(), name: "Midnight Theme", description: "Unlock a deep dark theme with neon accents", cost: 100, type: "theme", icon: "🌙", data: "midnight" },
    { id: randomUUID(), name: "Sunset Theme", description: "Warm orange and pink gradient theme", cost: 100, type: "theme", icon: "🌅", data: "sunset" },
    { id: randomUUID(), name: "Ocean Theme", description: "Cool blue and teal oceanic theme", cost: 100, type: "theme", icon: "🌊", data: "ocean" },
    { id: randomUUID(), name: "Forest Theme", description: "Deep green nature-inspired theme", cost: 100, type: "theme", icon: "🌲", data: "forest" },
    { id: randomUUID(), name: "Gold Star Badge", description: "A shiny gold star displayed on your profile", cost: 50, type: "badge", icon: "⭐", data: "gold-star" },
    { id: randomUUID(), name: "Diamond Badge", description: "The prestigious diamond badge", cost: 200, type: "badge", icon: "💎", data: "diamond" },
    { id: randomUUID(), name: "Crown Badge", description: "A royal crown for task royalty", cost: 300, type: "badge", icon: "👑", data: "crown" },
    { id: randomUUID(), name: "Task Master Title", description: "Display 'Task Master' on your profile", cost: 150, type: "title", icon: "🏅", data: "Task Master" },
    { id: randomUUID(), name: "Productivity Guru Title", description: "Display 'Productivity Guru' on your profile", cost: 250, type: "title", icon: "🧠", data: "Productivity Guru" },
    { id: randomUUID(), name: "Legend Title", description: "Display 'Legend' on your profile", cost: 500, type: "title", icon: "🏆", data: "Legend" },
  ]);
}

export async function getCompletedTaskCount(userId: string): Promise<number> {
  const [row] = await db.select({ value: count() }).from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.status, "completed")));
  return Number(row?.value) || 0;
}

// ─── Usage + Storage Controls ────────────────────────────────────────────────
const DEFAULT_STORAGE_POLICY = {
  maxTasks: Number(process.env.STORAGE_MAX_TASKS || 100000),
  maxAttachmentBytes: Number(process.env.STORAGE_MAX_ATTACHMENT_BYTES || 50 * 1024 * 1024),
  maxAttachmentCount: Number(process.env.STORAGE_MAX_ATTACHMENT_COUNT || 500),
  maxTaskRetentionDays: Number(process.env.STORAGE_MAX_TASK_RETENTION_DAYS || 3650),
  softWarningPercent: Number(process.env.STORAGE_SOFT_WARNING_PERCENT || 80),
};

export async function getStoragePolicy(userId: string): Promise<StoragePolicy | (typeof DEFAULT_STORAGE_POLICY & { id: string; userId: string | null })> {
  const [row] = await db.select().from(storagePolicies).where(eq(storagePolicies.userId, userId));
  if (row) return row;
  return {
    id: "default",
    userId: null,
    ...DEFAULT_STORAGE_POLICY,
  };
}

export async function getStorageUsage(userId: string): Promise<{
  taskCount: number;
  attachmentCount: number;
  attachmentBytes: number;
}> {
  const [[taskCountRow], [attachmentRows]] = await Promise.all([
    db.select({ value: count() }).from(tasks).where(eq(tasks.userId, userId)),
    db.select({
      value: count(),
      bytes: sql<number>`COALESCE(SUM(${attachmentAssets.byteSize}), 0)`,
    }).from(attachmentAssets).where(and(eq(attachmentAssets.userId, userId), sql`${attachmentAssets.deletedAt} IS NULL`)),
  ]);

  return {
    taskCount: Number(taskCountRow?.value) || 0,
    attachmentCount: Number(attachmentRows?.value) || 0,
    attachmentBytes: Number(attachmentRows?.bytes) || 0,
  };
}

export async function assertCanCreateTasks(userId: string, incomingTasks: number): Promise<{ ok: boolean; message?: string }> {
  const [policy, usage] = await Promise.all([getStoragePolicy(userId), getStorageUsage(userId)]);
  if (usage.taskCount + incomingTasks > policy.maxTasks) {
    return {
      ok: false,
      message: `Task limit reached (${policy.maxTasks}). Remove older tasks or request a higher limit.`,
    };
  }
  return { ok: true };
}

export async function assertCanStoreAttachment(userId: string, byteSize: number): Promise<{ ok: boolean; message?: string }> {
  const [policy, usage] = await Promise.all([getStoragePolicy(userId), getStorageUsage(userId)]);
  if (usage.attachmentCount + 1 > policy.maxAttachmentCount) {
    return {
      ok: false,
      message: `Attachment count limit reached (${policy.maxAttachmentCount}).`,
    };
  }
  if (usage.attachmentBytes + byteSize > policy.maxAttachmentBytes) {
    return {
      ok: false,
      message: `Attachment storage limit reached (${policy.maxAttachmentBytes} bytes).`,
    };
  }
  return { ok: true };
}

export async function createAttachmentAsset(input: {
  userId: string;
  kind?: string;
  fileName?: string;
  mimeType: string;
  byteSize: number;
  metadataJson?: string;
}): Promise<AttachmentAsset> {
  const [asset] = await db.insert(attachmentAssets).values({
    id: randomUUID(),
    userId: input.userId,
    kind: input.kind || "feedback",
    fileName: input.fileName || null,
    mimeType: input.mimeType,
    byteSize: input.byteSize,
    metadataJson: input.metadataJson || null,
  }).returning();
  return asset;
}

export async function getAttachmentAssets(userId: string, kind?: string): Promise<AttachmentAsset[]> {
  if (kind) {
    return db.select().from(attachmentAssets).where(and(
      eq(attachmentAssets.userId, userId),
      eq(attachmentAssets.kind, kind),
      sql`${attachmentAssets.deletedAt} IS NULL`,
    )).orderBy(desc(attachmentAssets.createdAt));
  }
  return db.select().from(attachmentAssets).where(and(
    eq(attachmentAssets.userId, userId),
    sql`${attachmentAssets.deletedAt} IS NULL`,
  )).orderBy(desc(attachmentAssets.createdAt));
}

export async function saveUsageSnapshot(input: {
  snapshotDate: string;
  source?: string;
  requests: number;
  errors: number;
  p95Ms: number;
  dbStorageMb: number;
  taskCount: number;
  attachmentBytes: number;
  spendMtdCents: number;
}): Promise<UsageSnapshot> {
  const [existing] = await db.select().from(usageSnapshots).where(eq(usageSnapshots.snapshotDate, input.snapshotDate));
  if (existing) {
    const [updated] = await db.update(usageSnapshots).set({
      source: input.source || existing.source,
      requests: input.requests,
      errors: input.errors,
      p95Ms: input.p95Ms,
      dbStorageMb: input.dbStorageMb,
      taskCount: input.taskCount,
      attachmentBytes: input.attachmentBytes,
      spendMtdCents: input.spendMtdCents,
    }).where(eq(usageSnapshots.id, existing.id)).returning();
    return updated;
  }

  const [created] = await db.insert(usageSnapshots).values({
    id: randomUUID(),
    snapshotDate: input.snapshotDate,
    source: input.source || "internal",
    requests: input.requests,
    errors: input.errors,
    p95Ms: input.p95Ms,
    dbStorageMb: input.dbStorageMb,
    taskCount: input.taskCount,
    attachmentBytes: input.attachmentBytes,
    spendMtdCents: input.spendMtdCents,
  }).returning();
  return created;
}

export async function getUsageSnapshots(limit = 30): Promise<UsageSnapshot[]> {
  return db.select().from(usageSnapshots).orderBy(desc(usageSnapshots.snapshotDate)).limit(limit);
}

export async function hasImportFingerprint(userId: string, fingerprint: string): Promise<boolean> {
  const [row] = await db.select({ value: count() })
    .from(taskImportFingerprints)
    .where(and(eq(taskImportFingerprints.userId, userId), eq(taskImportFingerprints.fingerprint, fingerprint)));
  return (Number(row?.value) || 0) > 0;
}

export async function recordImportFingerprint(userId: string, fingerprint: string, source: string, firstTaskId?: string): Promise<void> {
  await db.insert(taskImportFingerprints).values({
    id: randomUUID(),
    userId,
    fingerprint,
    source,
    firstTaskId: firstTaskId || null,
  }).onConflictDoNothing();
}

// ─── Invoicing, MFA, Idempotency ────────────────────────────────────────────
function hashMfaCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export async function createMfaChallenge(userId: string, purpose: string, ttlMinutes = 10): Promise<{ challengeId: string; code: string; expiresAt: Date }> {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const challengeId = randomUUID();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  await db.insert(mfaChallenges).values({
    id: challengeId,
    userId,
    purpose,
    codeHash: hashMfaCode(code),
    expiresAt,
  });
  return { challengeId, code, expiresAt };
}

export async function verifyMfaChallenge(userId: string, challengeId: string, code: string): Promise<boolean> {
  const [challenge] = await db.select().from(mfaChallenges).where(and(
    eq(mfaChallenges.id, challengeId),
    eq(mfaChallenges.userId, userId),
  ));
  if (!challenge || challenge.consumedAt || challenge.expiresAt < new Date()) return false;
  if (challenge.attempts >= 5) return false;

  const valid = challenge.codeHash === hashMfaCode(code);
  if (!valid) {
    await db.update(mfaChallenges)
      .set({ attempts: challenge.attempts + 1 })
      .where(eq(mfaChallenges.id, challenge.id));
    return false;
  }

  await db.update(mfaChallenges).set({ consumedAt: new Date() }).where(eq(mfaChallenges.id, challenge.id));
  return true;
}

export async function createInvoice(input: {
  userId: string;
  invoiceNumber: string;
  amountCents: number;
  currency?: string;
  dueDate?: string;
  metadataJson?: string;
}): Promise<Invoice> {
  const [invoice] = await db.insert(invoices).values({
    id: randomUUID(),
    userId: input.userId,
    invoiceNumber: input.invoiceNumber,
    amountCents: input.amountCents,
    currency: (input.currency || "USD").toUpperCase(),
    status: "draft",
    dueDate: input.dueDate || null,
    metadataJson: input.metadataJson || null,
  }).returning();
  await db.insert(invoiceEvents).values({
    id: randomUUID(),
    invoiceId: invoice.id,
    actorUserId: input.userId,
    eventType: "created",
    details: "Invoice created",
  });
  return invoice;
}

export async function issueInvoice(invoiceId: string, actorUserId: string): Promise<Invoice | undefined> {
  const [invoice] = await db.update(invoices).set({ status: "issued", issuedAt: new Date(), updatedAt: new Date() })
    .where(eq(invoices.id, invoiceId))
    .returning();
  if (!invoice) return undefined;
  await db.insert(invoiceEvents).values({
    id: randomUUID(),
    invoiceId,
    actorUserId,
    eventType: "issued",
    details: "Invoice issued",
  });
  return invoice;
}

export async function confirmInvoicePayment(invoiceId: string, actorUserId: string, confirmationNumber: string, externalReference?: string): Promise<Invoice | undefined> {
  const [invoice] = await db.update(invoices).set({
    status: "paid",
    confirmationNumber,
    externalReference: externalReference || null,
    paidAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(invoices.id, invoiceId)).returning();
  if (!invoice) return undefined;
  await db.insert(invoiceEvents).values({
    id: randomUUID(),
    invoiceId,
    actorUserId,
    eventType: "paid",
    details: `Payment confirmed: ${confirmationNumber}`,
  });
  return invoice;
}

export async function listInvoices(limit = 100): Promise<Invoice[]> {
  return db.select().from(invoices).orderBy(desc(invoices.createdAt)).limit(limit);
}

export async function listInvoiceEvents(invoiceId: string): Promise<InvoiceEvent[]> {
  return db.select().from(invoiceEvents).where(eq(invoiceEvents.invoiceId, invoiceId)).orderBy(desc(invoiceEvents.createdAt));
}

export async function ensureIdempotencyKey(key: string, route: string, userId?: string): Promise<{ fresh: boolean }> {
  const [existing] = await db.select().from(idempotencyKeys).where(and(
    eq(idempotencyKeys.key, key),
    eq(idempotencyKeys.route, route),
  ));
  if (existing) return { fresh: false };
  await db.insert(idempotencyKeys).values({
    id: randomUUID(),
    key,
    route,
    userId: userId || null,
  });
  return { fresh: true };
}