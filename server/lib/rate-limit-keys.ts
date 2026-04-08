import type { Request } from "express";
import { ipKeyGenerator } from "express-rate-limit";

function anonymousIpRateLimitKey(req: Request): string {
  const ip = (req.ip || req.socket?.remoteAddress || "").trim();
  return ipKeyGenerator(ip || "unknown");
}

/** API / voice / premium: per-user when authenticated, else IPv6-safe IP key (Express `req.ip` + trust proxy). */
export function userOrIpKey(req: Request): string {
  if (req.user?.id) return `user:${req.user.id}`;
  return anonymousIpRateLimitKey(req);
}

/** Migration and other sensitive routes: same keying as userOrIpKey (trusted `req.ip`, not raw X-Forwarded-For). */
export function trustedIpKey(req: Request): string {
  if (req.user?.id) return `user:${req.user.id}`;
  return anonymousIpRateLimitKey(req);
}
