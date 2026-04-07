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

/**
 * Atomically validates the plaintext token, rotates its hash (invalidates the presented cookie value),
 * and returns the user id plus the new plaintext for Set-Cookie. Concurrent requests with the same
 * cookie: only one UPDATE matches the old hash; others get null.
 */
export async function lookupValidDeviceRefreshUserId(
  plainToken: string,
  userAgent?: string | null,
): Promise<{ userId: string; newPlain: string } | null> {
  if (!isDeviceRefreshTokenShape(plainToken)) return null;
  const oldHash = hashDeviceRefreshToken(plainToken);
  const now = new Date();
  const ua = userAgent?.slice(0, 512) || null;
  const newPlain = generateDeviceRefreshPlainToken();
  const newHash = hashDeviceRefreshToken(newPlain);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  const [row] = await db
    .update(deviceRefreshTokens)
    .set({
      tokenHash: newHash,
      expiresAt,
      lastUsedAt: new Date(),
      ...(ua !== null ? { userAgent: ua } : {}),
    })
    .where(and(eq(deviceRefreshTokens.tokenHash, oldHash), gt(deviceRefreshTokens.expiresAt, now)))
    .returning({ userId: deviceRefreshTokens.userId });

  if (!row) return null;
  await pruneExcessTokens(row.userId);
  return { userId: row.userId, newPlain };
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
  const ua = userAgent?.slice(0, 512) || null;
  const plain = await db.transaction(async (tx) => {
    const nextPlain = generateDeviceRefreshPlainToken();
    const nextHash = hashDeviceRefreshToken(nextPlain);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    const updated = await tx
      .update(deviceRefreshTokens)
      .set({
        tokenHash: nextHash,
        expiresAt,
        lastUsedAt: new Date(),
      })
      .where(and(eq(deviceRefreshTokens.tokenHash, tokenHash), eq(deviceRefreshTokens.userId, userId)))
      .returning({ id: deviceRefreshTokens.id });

    if (updated.length === 1) {
      return nextPlain;
    }

    const [wrong] = await tx
      .select({ userId: deviceRefreshTokens.userId })
      .from(deviceRefreshTokens)
      .where(eq(deviceRefreshTokens.tokenHash, tokenHash))
      .limit(1);
    if (wrong && wrong.userId !== userId) {
      throw new Error("Device token rotation failed: token does not belong to this user");
    }

    throw new Error("Device token rotation failed: token reuse detected");
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
  const noStore = () => res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");

  const plain = req.cookies?.[DEVICE_REFRESH_COOKIE] as string | undefined;
  if (!plain) {
    noStore();
    res.status(401).json({ message: "No device session" });
    return;
  }
  const rotated = await lookupValidDeviceRefreshUserId(plain, req.get("user-agent"));
  if (!rotated) {
    clearDeviceRefreshCookie(res);
    noStore();
    res.status(401).json({ message: "Device session expired or invalid" });
    return;
  }
  const { userId, newPlain } = rotated;
  const user = await getUserById(userId);
  if (!user) {
    await revokeDeviceRefreshByPlain(newPlain);
    clearDeviceRefreshCookie(res);
    noStore();
    res.status(401).json({ message: "Not authenticated" });
    return;
  }
  if (user.isBanned) {
    await revokeDeviceRefreshByPlain(newPlain);
    clearDeviceRefreshCookie(res);
    noStore();
    res.status(403).json({ message: "This account has been suspended." });
    return;
  }

  req.login(user, (err) => {
    if (err) {
      console.error("[auth] refresh session error:", err);
      clearDeviceRefreshCookie(res);
      noStore();
      res.status(500).json({ message: "Session restore failed" });
      return;
    }
    setDeviceRefreshCookie(res, newPlain);
    noStore();
    res.json(user);
  });
}
