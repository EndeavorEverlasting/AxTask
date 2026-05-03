export type RandomUuidOptions = {
  /**
   * When true and `crypto.getRandomValues` is unavailable, throw instead of using
   * `Math.random` (non-cryptographic, predictable).
   */
  throwOnInsecureFallback?: boolean;
};

/**
 * RFC 4122 v4 UUID; works when `crypto.randomUUID` is missing (non-secure contexts / older browsers).
 * If neither `randomUUID` nor `getRandomValues` exists, falls back to `Math.random` and logs a console
 * warning (or throws when `throwOnInsecureFallback` is true).
 */
export function randomUuid(options?: RandomUuidOptions): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    const msg =
      "[AxTask] UUID: crypto.getRandomValues is unavailable; using Math.random fallback (non-cryptographic, predictable).";
    if (options?.throwOnInsecureFallback) {
      throw new Error(msg);
    }
    console.warn(msg);
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
