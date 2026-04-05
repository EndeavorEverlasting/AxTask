import type { Request, Response } from "express";
import { eq, desc, inArray, and, gt } from "drizzle-orm";
import { deviceRefreshTokens } from "@shared/schema";
import { db } from "./db";
import { getUserById } from "./storage";
import { parseCookieSecureFlag } from "./lib/login-env-policy";
import {
  generateDeviceRefreshPlainToken,
  hashDeviceRefreshToken,
  isDeviceRefreshTokenShape,
} from "./lib/device-refresh-crypto";

export const DEVICE_REFRESH_COOKIE = "axtask.drefresh";

const MAX_TOKENS_PER_USER = 15;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function cookieBase() {
  const secure = parseCookieSecureFlag(process.env);
  return {
    httpOnly: true as const,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: TOKEN_TTL_MS,
  };
}

export function setDeviceRefreshCookie(res: Response, plainToken: string): void {
  res.cookie(DEVICE_REFRESH_COOKIE, plainToken, cookieBase());
}

export function clearDeviceRefreshCookie(res: Response): void {
  res.clearCookie(DEVICE_REFRESH_COOKIE, {
    path: "/",
    secure: parseCookieSecureFlag(process.env),
    sameSite: "lax",
    httpOnly: true,
  });
}

async function pruneExcessTokens(userId: string): Promise<void> {
  const rows = await db
    .select({ id: deviceRefreshTokens.id })
    .from(deviceRefreshTokens)
    .where(eq(deviceRefreshTokens.userId, userId))
    .orderBy(desc(deviceRefreshTokens.createdAt));

  if (rows.length <= MAX_TOKENS_PER_USER) return;
  const drop = rows.slice(MAX_TOKENS_PER_USER).map((r) => r.id);
  if (drop.length) {
    await db.delete(deviceRefreshTokens).where(inArray(deviceRefreshTokens.id, drop));
  }
}

/** Create DB row and return one-time plaintext for Set-Cookie. */
export async function createDeviceRefreshTokenRow(
  userId: string,
  userAgent: string | undefined,
): Promise<string> {
  const plain = generateDeviceRefreshPlainToken();
  const tokenHash = hashDeviceRefreshToken(plain);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await db.insert(deviceRefreshTokens).values({
    userId,
    tokenHash,
    expiresAt,
    userAgent: userAgent?.slice(0, 512) || null,
  });
  await pruneExcessTokens(userId);
  return plain;
}

export async function revokeDeviceRefreshByPlain(plainToken: string | undefined): Promise<void> {
  if (!plainToken || !isDeviceRefreshTokenShape(plainToken)) return;
  const tokenHash = hashDeviceRefreshToken(plainToken);
  await db.delete(deviceRefreshTokens).where(eq(deviceRefreshTokens.tokenHash, tokenHash));
}

/** Validate plaintext token; returns userId or null. Does not delete (use rotate after session established). */
export async function lookupValidDeviceRefreshUserId(plainToken: string): Promise<string | null> {
  if (!isDeviceRefreshTokenShape(plainToken)) return null;
  const tokenHash = hashDeviceRefreshToken(plainToken);
  const now = new Date();
  const [row] = await db
    .select({ userId: deviceRefreshTokens.userId, id: deviceRefreshTokens.id })
    .from(deviceRefreshTokens)
    .where(and(eq(deviceRefreshTokens.tokenHash, tokenHash), gt(deviceRefreshTokens.expiresAt, now)))
    .limit(1);
  if (!row) return null;
  await db
    .update(deviceRefreshTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(deviceRefreshTokens.id, row.id));
  return row.userId;
}

/** Replace old plaintext token with a new row and return new plaintext. */
export async function rotateDeviceRefreshToken(
  oldPlain: string,
  userId: string,
  userAgent: string | undefined,
): Promise<string> {
  if (!isDeviceRefreshTokenShape(oldPlain)) {
    throw new Error("Invalid device token");
  }
  const tokenHash = hashDeviceRefreshToken(oldPlain);
  const plain = await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(deviceRefreshTokens)
      .where(eq(deviceRefreshTokens.tokenHash, tokenHash))
      .returning({ id: deviceRefreshTokens.id, userId: deviceRefreshTokens.userId });
    if (deleted.length !== 1) {
      throw new Error("Device token rotation failed: token not found or already revoked");
    }
    if (deleted[0].userId !== userId) {
      throw new Error("Device token rotation failed: token does not belong to this user");
    }
    const nextPlain = generateDeviceRefreshPlainToken();
    const nextHash = hashDeviceRefreshToken(nextPlain);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await tx.insert(deviceRefreshTokens).values({
      userId,
      tokenHash: nextHash,
      expiresAt,
      userAgent: userAgent?.slice(0, 512) || null,
    });
    return nextPlain;
  });
  await pruneExcessTokens(userId);
  return plain;
}

/** Set httpOnly device cookie after successful Passport login (local + OAuth). */
export async function grantDeviceRefreshForUser(req: Request, res: Response, userId: string): Promise<void> {
  const plain = await createDeviceRefreshTokenRow(userId, req.get("user-agent"));
  setDeviceRefreshCookie(res, plain);
}

export async function revokeDeviceRefreshFromRequest(req: Request): Promise<void> {
  const tok = req.cookies?.[DEVICE_REFRESH_COOKIE] as string | undefined;
  await revokeDeviceRefreshByPlain(tok);
}

/** Core handler for POST /api/auth/refresh */
export async function performAuthRefresh(req: Request, res: Response): Promise<void> {
  const plain = req.cookies?.[DEVICE_REFRESH_COOKIE] as string | undefined;
  if (!plain) {
    res.status(401).json({ message: "No device session" });
    return;
  }
  const userId = await lookupValidDeviceRefreshUserId(plain);
  if (!userId) {
    clearDeviceRefreshCookie(res);
    res.status(401).json({ message: "Device session expired or invalid" });
    return;
  }
  const user = await getUserById(userId);
  if (!user) {
    await revokeDeviceRefreshByPlain(plain);
    clearDeviceRefreshCookie(res);
    res.status(401).json({ message: "Not authenticated" });
    return;
  }
  if (user.isBanned) {
    await revokeDeviceRefreshByPlain(plain);
    clearDeviceRefreshCookie(res);
    res.status(403).json({ message: "This account has been suspended." });
    return;
  }

  req.login(user, async (err) => {
    if (err) {
      console.error("[auth] refresh session error:", err);
      res.status(500).json({ message: "Session restore failed" });
      return;
    }
    try {
      const newPlain = await rotateDeviceRefreshToken(plain, userId, req.get("user-agent"));
      setDeviceRefreshCookie(res, newPlain);
    } catch (e) {
      console.error("[auth] refresh rotate:", e);
    }
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.json(user);
  });
}
