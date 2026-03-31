import { tasks, users, passwordResetTokens, securityLogs, wallets, coinTransactions, userBadges, rewardsCatalog, userRewards, taskCollaborators, taskPatterns, classificationContributions, classificationConfirmations, importHistory, type Task, type InsertTask, type UpdateTask, type User, type SafeUser, type SecurityLog, type Wallet, type CoinTransaction, type UserBadge, type RewardItem, type TaskCollaborator, type TaskPattern, type InsertTaskPattern, type ClassificationContribution, type ClassificationConfirmation, type ImportHistory } from "@shared/schema";
import { computeContentHash } from "./fingerprint";
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
  createTasksBulk(userId: string, taskList: InsertTask[], options?: { forceImported?: boolean }): Promise<Task[]>;
  bulkUpdateTasks(userId: string, updates: UpdateTask[]): Promise<void>;
  reorderTasks(userId: string, taskIds: string[]): Promise<void>;
  findTasksByContentHashes(userId: string, hashes: string[]): Promise<Pick<Task, 'id' | 'contentHash' | 'status'>[]>;
  createImportRecord(record: { userId: string; fileName: string; fileHash: string; totalParsed: number; imported: number; skippedCompleted: number; skippedDuplicate: number; forceImported: number }): Promise<ImportHistory>;
  getImportHistory(userId: string): Promise<ImportHistory[]>;
  findImportByFileHash(userId: string, fileHash: string): Promise<ImportHistory | undefined>;
  backfillContentHashes(): Promise<number>;
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
    const contentHash = computeContentHash(insertTask.activity, insertTask.date);

    const taskData = {
      ...insertTask,
      id,
      userId,
      priority: "Low",
      priorityScore: 0,
      classification: "General",
      isRepeated: false,
      contentHash,
      createdAt: now,
      updatedAt: now,
    };

    const [task] = await db.insert(tasks).values(taskData).returning();
    return task;
  }

  async createTasksBulk(userId: string, taskList: InsertTask[], options?: { forceImported?: boolean }): Promise<Task[]> {
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
        contentHash: computeContentHash(t.activity, t.date),
        forceImported: options?.forceImported || false,
        createdAt: now,
        updatedAt: now,
      }));
      const inserted = await db.insert(tasks).values(values).returning();
      allInserted.push(...inserted);
    }
    return allInserted;
  }

  async updateTask(userId: string, updateTask: UpdateTask): Promise<Task | undefined> {
    const updates: any = { ...updateTask, updatedAt: new Date() };
    if (updateTask.activity || updateTask.date) {
      const existing = await this.getTask(userId, updateTask.id);
      if (existing) {
        const activity = updateTask.activity || existing.activity;
        const date = updateTask.date || existing.date;
        updates.contentHash = computeContentHash(activity, date);
      }
    }
    const [task] = await db
      .update(tasks)
      .set(updates)
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

  async findTasksByContentHashes(userId: string, hashes: string[]): Promise<Pick<Task, 'id' | 'contentHash' | 'status'>[]> {
    if (hashes.length === 0) return [];
    const BATCH = 500;
    const results: Pick<Task, 'id' | 'contentHash' | 'status'>[] = [];
    for (let i = 0; i < hashes.length; i += BATCH) {
      const batch = hashes.slice(i, i + BATCH);
      const hashParams = batch.map(h => sql`${h}`);
      const rows = await db
        .select({ id: tasks.id, contentHash: tasks.contentHash, status: tasks.status })
        .from(tasks)
        .where(and(
          eq(tasks.userId, userId),
          sql`${tasks.contentHash} IN (${sql.join(hashParams, sql`, `)})`
        ));
      results.push(...rows);
    }
    return results;
  }

  async createImportRecord(record: { userId: string; fileName: string; fileHash: string; totalParsed: number; imported: number; skippedCompleted: number; skippedDuplicate: number; forceImported: number }): Promise<ImportHistory> {
    const [row] = await db.insert(importHistory).values(record).returning();
    return row;
  }

  async getImportHistory(userId: string): Promise<ImportHistory[]> {
    return await db
      .select()
      .from(importHistory)
      .where(eq(importHistory.userId, userId))
      .orderBy(desc(importHistory.createdAt))
      .limit(50);
  }

  async findImportByFileHash(userId: string, fileHash: string): Promise<ImportHistory | undefined> {
    const [row] = await db
      .select()
      .from(importHistory)
      .where(and(eq(importHistory.userId, userId), eq(importHistory.fileHash, fileHash)))
      .orderBy(desc(importHistory.createdAt))
      .limit(1);
    return row || undefined;
  }

  async backfillContentHashes(): Promise<number> {
    let totalProcessed = 0;
    const BATCH_SIZE = 5000;

    while (true) {
      const unhashed = await db
        .select({ id: tasks.id, activity: tasks.activity, date: tasks.date, userId: tasks.userId })
        .from(tasks)
        .where(sql`${tasks.contentHash} IS NULL`)
        .limit(BATCH_SIZE);

      if (unhashed.length === 0) break;

      for (const t of unhashed) {
        const hash = computeContentHash(t.activity, t.date);
        await db.update(tasks).set({ contentHash: hash }).where(eq(tasks.id, t.id));
      }
      totalProcessed += unhashed.length;

      if (unhashed.length < BATCH_SIZE) break;
    }

    return totalProcessed;
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
          sql`${tasks.updatedAt}::date = ${today}::date`,
          sql`(${tasks.forceImported} IS NULL OR ${tasks.forceImported} = false)`
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
  await getOrCreateWallet(userId);
  const [updated] = await db
    .update(wallets)
    .set({
      balance: sql`${wallets.balance} + ${amount}`,
      lifetimeEarned: sql`${wallets.lifetimeEarned} + ${amount}`,
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
  await getOrCreateWallet(userId);
  const [updated] = await db
    .update(wallets)
    .set({ balance: sql`${wallets.balance} - ${amount}` })
    .where(and(eq(wallets.userId, userId), sql`${wallets.balance} >= ${amount}`))
    .returning();
  if (!updated) return null;
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

export async function resetStreak(userId: string): Promise<void> {
  await db
    .update(wallets)
    .set({ currentStreak: 0 })
    .where(eq(wallets.userId, userId));
}

export async function useStreakShield(userId: string): Promise<boolean> {
  const wallet = await getOrCreateWallet(userId);
  if (wallet.streakShields <= 0) return false;
  await db
    .update(wallets)
    .set({ streakShields: sql`${wallets.streakShields} - 1` })
    .where(eq(wallets.userId, userId));
  return true;
}

export async function buyStreakShield(userId: string): Promise<{ success: boolean; wallet?: Wallet; error?: string }> {
  const SHIELD_COST = 25;
  const wallet = await getOrCreateWallet(userId);
  if (wallet.balance < SHIELD_COST) return { success: false, error: "Insufficient balance" };
  if (wallet.streakShields >= 3) return { success: false, error: "Maximum 3 shields" };
  const [updated] = await db
    .update(wallets)
    .set({
      balance: sql`${wallets.balance} - ${SHIELD_COST}`,
      streakShields: sql`${wallets.streakShields} + 1`,
    })
    .where(eq(wallets.userId, userId))
    .returning();
  await db.insert(coinTransactions).values({
    id: randomUUID(),
    userId,
    amount: -SHIELD_COST,
    reason: "streak_shield_purchase",
    details: "Purchased streak shield",
  });
  return { success: true, wallet: updated };
}

export async function giftCoins(
  fromUserId: string,
  toUserId: string,
  amount: number
): Promise<{ success: boolean; senderBalance?: number; error?: string }> {
  if (amount < 1 || amount > 500) return { success: false, error: "Amount must be 1-500" };
  if (fromUserId === toUserId) return { success: false, error: "Cannot gift to yourself" };
  const sender = await getOrCreateWallet(fromUserId);
  if (sender.balance < amount) return { success: false, error: "Insufficient balance" };
  await getOrCreateWallet(toUserId);
  await db
    .update(wallets)
    .set({ balance: sql`${wallets.balance} - ${amount}` })
    .where(eq(wallets.userId, fromUserId));
  await db
    .update(wallets)
    .set({
      balance: sql`${wallets.balance} + ${amount}`,
      lifetimeEarned: sql`${wallets.lifetimeEarned} + ${amount}`,
    })
    .where(eq(wallets.userId, toUserId));
  const txId1 = randomUUID();
  const txId2 = randomUUID();
  await db.insert(coinTransactions).values([
    { id: txId1, userId: fromUserId, amount: -amount, reason: "coin_gift_sent", details: `Gifted to user` },
    { id: txId2, userId: toUserId, amount, reason: "coin_gift_received", details: `Received gift` },
  ]);
  const updatedSender = await getOrCreateWallet(fromUserId);
  return { success: true, senderBalance: updatedSender.balance };
}

export async function setTaskBounty(
  userId: string,
  taskId: string,
  amount: number
): Promise<{ success: boolean; error?: string }> {
  if (amount < 5 || amount > 200) return { success: false, error: "Bounty must be 5-200 coins" };
  const wallet = await getOrCreateWallet(userId);
  if (wallet.balance < amount) return { success: false, error: "Insufficient balance" };
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) return { success: false, error: "Task not found" };
  if (task.bounty && task.bounty > 0) return { success: false, error: "Task already has a bounty" };
  await db.update(wallets).set({ balance: sql`${wallets.balance} - ${amount}` }).where(eq(wallets.userId, userId));
  await db.update(tasks).set({ bounty: amount, bountySetBy: userId }).where(eq(tasks.id, taskId));
  await db.insert(coinTransactions).values({
    id: randomUUID(),
    userId,
    amount: -amount,
    reason: "bounty_set",
    details: `Set bounty on task: ${task.activity.substring(0, 80)}`,
    taskId,
  });
  return { success: true };
}

export async function claimBounty(
  userId: string,
  taskId: string
): Promise<{ success: boolean; amount?: number; error?: string }> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task || !task.bounty || task.bounty <= 0) return { success: false, error: "No bounty on this task" };
  if (task.bountySetBy === userId) return { success: false, error: "Cannot claim your own bounty" };
  const amount = task.bounty;
  await getOrCreateWallet(userId);
  await db.update(wallets).set({
    balance: sql`${wallets.balance} + ${amount}`,
    lifetimeEarned: sql`${wallets.lifetimeEarned} + ${amount}`,
  }).where(eq(wallets.userId, userId));
  await db.update(tasks).set({ bounty: 0, bountySetBy: null }).where(eq(tasks.id, taskId));
  await db.insert(coinTransactions).values({
    id: randomUUID(),
    userId,
    amount,
    reason: "bounty_claimed",
    details: `Claimed bounty on: ${task.activity.substring(0, 80)}`,
    taskId,
  });
  return { success: true, amount };
}

export async function boostTaskPriority(
  userId: string,
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  const BOOST_COST = 20;
  const wallet = await getOrCreateWallet(userId);
  if (wallet.balance < BOOST_COST) return { success: false, error: "Insufficient balance (need 20 coins)" };
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) return { success: false, error: "Task not found" };
  if (task.priority === "Highest") return { success: false, error: "Task is already Highest priority" };
  await db.update(wallets).set({ balance: sql`${wallets.balance} - ${BOOST_COST}` }).where(eq(wallets.userId, userId));
  await db.update(tasks).set({ priority: "Highest", priorityScore: 100 }).where(eq(tasks.id, taskId));
  await db.insert(coinTransactions).values({
    id: randomUUID(),
    userId,
    amount: -BOOST_COST,
    reason: "priority_boost",
    details: `Boosted task to Highest: ${task.activity.substring(0, 80)}`,
    taskId,
  });
  return { success: true };
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

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ value: count() })
      .from(userRewards)
      .where(and(eq(userRewards.userId, userId), eq(userRewards.rewardId, rewardId)));
    if ((Number(existing?.value) || 0) > 0) return false;

    const [deducted] = await tx
      .update(wallets)
      .set({ balance: sql`${wallets.balance} - ${reward.cost}` })
      .where(and(eq(wallets.userId, userId), sql`${wallets.balance} >= ${reward.cost}`))
      .returning();
    if (!deducted) return false;

    await tx.insert(coinTransactions).values({
      id: randomUUID(),
      userId,
      amount: -reward.cost,
      reason: `Redeemed: ${reward.name}`,
    });

    await tx.insert(userRewards).values({ id: randomUUID(), userId, rewardId });
    return true;
  });
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
  const [row] = await db.select({ value: count() }).from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.status, "completed"), sql`(${tasks.forceImported} IS NULL OR ${tasks.forceImported} = false)`));
  return Number(row?.value) || 0;
}

// ─── Collaboration helpers ──────────────────────────────────────────────────

export async function addCollaborator(
  taskId: string,
  userId: string,
  role: string,
  invitedBy: string
): Promise<TaskCollaborator> {
  const existing = await db
    .select()
    .from(taskCollaborators)
    .where(and(eq(taskCollaborators.taskId, taskId), eq(taskCollaborators.userId, userId)));
  if (existing.length > 0) {
    const [updated] = await db
      .update(taskCollaborators)
      .set({ role })
      .where(eq(taskCollaborators.id, existing[0].id))
      .returning();
    return updated;
  }
  const [collab] = await db
    .insert(taskCollaborators)
    .values({ id: randomUUID(), taskId, userId, role, invitedBy })
    .returning();
  return collab;
}

export async function removeCollaborator(taskId: string, userId: string): Promise<boolean> {
  const result = await db
    .delete(taskCollaborators)
    .where(and(eq(taskCollaborators.taskId, taskId), eq(taskCollaborators.userId, userId)))
    .returning();
  return result.length > 0;
}

export async function getTaskCollaborators(taskId: string): Promise<(TaskCollaborator & { email: string; displayName: string | null })[]> {
  const rows = await db
    .select({
      id: taskCollaborators.id,
      taskId: taskCollaborators.taskId,
      userId: taskCollaborators.userId,
      role: taskCollaborators.role,
      invitedBy: taskCollaborators.invitedBy,
      invitedAt: taskCollaborators.invitedAt,
      email: users.email,
      displayName: users.displayName,
    })
    .from(taskCollaborators)
    .innerJoin(users, eq(taskCollaborators.userId, users.id))
    .where(eq(taskCollaborators.taskId, taskId));
  return rows;
}

export async function updateCollaboratorRole(taskId: string, userId: string, role: string): Promise<TaskCollaborator | null> {
  const [updated] = await db
    .update(taskCollaborators)
    .set({ role })
    .where(and(eq(taskCollaborators.taskId, taskId), eq(taskCollaborators.userId, userId)))
    .returning();
  return updated ?? null;
}

export async function getSharedTasks(userId: string): Promise<Task[]> {
  const rows = await db
    .select({ taskId: taskCollaborators.taskId })
    .from(taskCollaborators)
    .where(eq(taskCollaborators.userId, userId));
  if (rows.length === 0) return [];
  const taskIds = rows.map(r => r.taskId);
  const result = await db.select().from(tasks).where(
    or(...taskIds.map(id => eq(tasks.id, id)))
  );
  return result;
}

export async function canAccessTask(userId: string, taskId: string): Promise<{ canAccess: boolean; role: string }> {
  const [task] = await db.select({ userId: tasks.userId }).from(tasks).where(eq(tasks.id, taskId));
  if (task?.userId === userId) return { canAccess: true, role: "owner" };
  const [collab] = await db
    .select({ role: taskCollaborators.role })
    .from(taskCollaborators)
    .where(and(eq(taskCollaborators.taskId, taskId), eq(taskCollaborators.userId, userId)));
  if (collab) return { canAccess: true, role: collab.role };
  return { canAccess: false, role: "" };
}

export async function isTaskOwner(userId: string, taskId: string): Promise<boolean> {
  const [task] = await db.select({ userId: tasks.userId }).from(tasks).where(eq(tasks.id, taskId));
  return task?.userId === userId;
}

// ─── Pattern Learning Storage ────────────────────────────────────────────────

export async function upsertPattern(
  userId: string,
  patternType: string,
  patternKey: string,
  data: Record<string, unknown>,
  confidence: number
): Promise<TaskPattern> {
  const now = new Date();
  const dataStr = JSON.stringify(data);

  const result = await db.execute(sql`
    INSERT INTO task_patterns (id, user_id, pattern_type, pattern_key, data, confidence, occurrences, last_seen, created_at)
    VALUES (${randomUUID()}, ${userId}, ${patternType}, ${patternKey}, ${dataStr}, ${confidence}, 1, ${now}, ${now})
    ON CONFLICT (user_id, pattern_type, pattern_key)
    DO UPDATE SET
      data = ${dataStr},
      confidence = ${confidence},
      occurrences = task_patterns.occurrences + 1,
      last_seen = ${now}
    RETURNING *
  `);

  return result.rows[0] as unknown as TaskPattern;
}

export async function getPatterns(userId: string): Promise<TaskPattern[]> {
  return db
    .select()
    .from(taskPatterns)
    .where(eq(taskPatterns.userId, userId))
    .orderBy(desc(taskPatterns.occurrences));
}

export async function getPatternsByType(userId: string, patternType: string): Promise<TaskPattern[]> {
  return db
    .select()
    .from(taskPatterns)
    .where(and(eq(taskPatterns.userId, userId), eq(taskPatterns.patternType, patternType)))
    .orderBy(desc(taskPatterns.occurrences));
}

export async function deleteStalePatterns(userId: string, olderThanDays: number = 90): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(taskPatterns)
    .where(and(eq(taskPatterns.userId, userId), lt(taskPatterns.lastSeen, cutoff)))
    .returning();
  return result.length;
}

export async function clearPatterns(userId: string): Promise<void> {
  await db.delete(taskPatterns).where(eq(taskPatterns.userId, userId));
}

// ─── Classification Contributions ──────────────────────────────────────────

export async function createClassificationContribution(
  taskId: string,
  userId: string,
  classification: string,
  baseCoinsAwarded: number
): Promise<ClassificationContribution> {
  const [existing] = await db
    .select()
    .from(classificationContributions)
    .where(and(
      eq(classificationContributions.taskId, taskId),
      eq(classificationContributions.userId, userId)
    ))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(classificationContributions)
      .set({
        classification,
        baseCoinsAwarded,
      })
      .where(eq(classificationContributions.id, existing.id))
      .returning();
    return updated;
  }

  const [contrib] = await db
    .insert(classificationContributions)
    .values({
      id: randomUUID(),
      taskId,
      userId,
      classification,
      baseCoinsAwarded,
      totalCoinsEarned: baseCoinsAwarded,
      confirmationCount: 0,
    })
    .returning();
  return contrib;
}

export async function getContributionsForTask(taskId: string): Promise<(ClassificationContribution & { displayName: string | null })[]> {
  const rows = await db
    .select({
      id: classificationContributions.id,
      taskId: classificationContributions.taskId,
      userId: classificationContributions.userId,
      classification: classificationContributions.classification,
      baseCoinsAwarded: classificationContributions.baseCoinsAwarded,
      totalCoinsEarned: classificationContributions.totalCoinsEarned,
      confirmationCount: classificationContributions.confirmationCount,
      cleanupBonuses: classificationContributions.cleanupBonuses,
      createdAt: classificationContributions.createdAt,
      displayName: users.displayName,
    })
    .from(classificationContributions)
    .innerJoin(users, eq(users.id, classificationContributions.userId))
    .where(eq(classificationContributions.taskId, taskId))
    .orderBy(desc(classificationContributions.createdAt));
  return rows;
}

export async function getContribution(taskId: string, userId: string): Promise<ClassificationContribution | null> {
  const [row] = await db
    .select()
    .from(classificationContributions)
    .where(and(
      eq(classificationContributions.taskId, taskId),
      eq(classificationContributions.userId, userId)
    ))
    .limit(1);
  return row || null;
}

export async function hasUserConfirmedTask(taskId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ value: count() })
    .from(classificationConfirmations)
    .where(and(
      eq(classificationConfirmations.taskId, taskId),
      eq(classificationConfirmations.userId, userId)
    ));
  return (Number(row?.value) || 0) > 0;
}

export async function recordConfirmation(
  contributionId: string,
  taskId: string,
  confirmingUserId: string,
  coinsAwarded: number
): Promise<ClassificationConfirmation> {
  const [confirmation] = await db
    .insert(classificationConfirmations)
    .values({
      id: randomUUID(),
      contributionId,
      taskId,
      userId: confirmingUserId,
      coinsAwarded,
    })
    .returning();

  return confirmation;
}

export async function incrementContributionConfirmCount(contributionId: string): Promise<void> {
  await db
    .update(classificationContributions)
    .set({
      confirmationCount: sql`${classificationContributions.confirmationCount} + 1`,
    })
    .where(eq(classificationContributions.id, contributionId));
}

export async function updateContributionEarnings(contributionId: string, additionalCoins: number): Promise<void> {
  await db
    .update(classificationContributions)
    .set({
      totalCoinsEarned: sql`${classificationContributions.totalCoinsEarned} + ${additionalCoins}`,
    })
    .where(eq(classificationContributions.id, contributionId));
}

export async function getUserClassificationStats(userId: string): Promise<{
  totalClassifications: number;
  totalConfirmationsReceived: number;
  totalClassificationCoins: number;
}> {
  const [classRow] = await db
    .select({
      total: count(),
      totalCoins: sql<number>`COALESCE(SUM(${classificationContributions.totalCoinsEarned}), 0)`,
      totalConfirmations: sql<number>`COALESCE(SUM(${classificationContributions.confirmationCount}), 0)`,
    })
    .from(classificationContributions)
    .where(eq(classificationContributions.userId, userId));

  return {
    totalClassifications: Number(classRow?.total) || 0,
    totalConfirmationsReceived: Number(classRow?.totalConfirmations) || 0,
    totalClassificationCoins: Number(classRow?.totalCoins) || 0,
  };
}