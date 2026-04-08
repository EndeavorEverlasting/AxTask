import type { Request, Response } from "express";
import type { SafeUser } from "@shared/schema";
import { getUserRowById } from "./storage";

const PENDING_TOTP_MS = 5 * 60 * 1000;

/**
 * If the user has TOTP enabled, store pending login and redirect to the login TOTP step.
 * Otherwise call `req.login` with the provided callback.
 */
export async function loginOrPendingTotp(
  req: Request,
  res: Response,
  user: SafeUser,
  onLoggedIn: (err?: Error | null) => void,
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
  req.login(user, onLoggedIn);
}
