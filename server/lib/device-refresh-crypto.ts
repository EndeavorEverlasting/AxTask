import { createHash, randomBytes } from "crypto";

export const DEVICE_REFRESH_TOKEN_PREFIX = "d1.";

export function isDeviceRefreshTokenShape(value: string): boolean {
  if (!value.startsWith(DEVICE_REFRESH_TOKEN_PREFIX)) return false;
  const secret = value.slice(DEVICE_REFRESH_TOKEN_PREFIX.length);
  return secret.length >= 32;
}

export function hashDeviceRefreshToken(plainToken: string): string {
  return createHash("sha256").update(plainToken, "utf8").digest("hex");
}

export function generateDeviceRefreshPlainToken(): string {
  return `${DEVICE_REFRESH_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}
