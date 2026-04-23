import type { Request, Response } from "express";
import type { SafeUser } from "@shared/schema";
import { awardLoginRewards } from "./login-rewards";
import { getUserRowById } from "./storage";

const PENDING_TOTP_MS = 5 * 60 * 1000;

/** Called after Passport session login succeeds (`err` is always null when invoked). */
export type AfterOAuthLogin = (err?: Error | null) => void | Promise<void>;

/**
 * If the user has TOTP enabled, store pending login and redirect to the login TOTP step.
 * Otherwise completes `req.login`, then runs `onLoggedIn` so async work (e.g. audit log + redirect)
 * stays inside the route's try/catch.
 */
export async function loginOrPendingTotp(
  req: Request,
  res: Response,
  user: SafeUser,
  onLoggedIn: AfterOAuthLogin,
): Promise<void> {
  const row = await getUserRowById(user.id);
  if (row?.totpEnabledAt && row.totpSecretCiphertext) {
    req.session.pendingTotpLogin = {
      userId: user.id,
      expiresAt: Date.now() + PENDING_TOTP_MS,
    };
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    res.redirect("/login?step=totp");
    return;
  }

  await new Promise<void>((resolve, reject) => {
    req.login(user, (err) => (err ? reject(err) : resolve()));
  });

  void awardLoginRewards(user.id);

  const maybePromise = onLoggedIn(null);
  if (maybePromise != null && typeof (maybePromise as Promise<void>).then === "function") {
    await maybePromise;
  }
}
