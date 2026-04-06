// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DEVICE_REFRESH_TOKEN_PREFIX,
  generateDeviceRefreshPlainToken,
  hashDeviceRefreshToken,
  isDeviceRefreshTokenShape,
} from "./device-refresh-crypto";

describe("device-refresh-crypto", () => {
  it("generates tokens with expected prefix and length", () => {
    const t = generateDeviceRefreshPlainToken();
    expect(t.startsWith(DEVICE_REFRESH_TOKEN_PREFIX)).toBe(true);
    expect(isDeviceRefreshTokenShape(t)).toBe(true);
  });

  it("rejects malformed tokens", () => {
    expect(isDeviceRefreshTokenShape("")).toBe(false);
    expect(isDeviceRefreshTokenShape("d1.short")).toBe(false);
    expect(isDeviceRefreshTokenShape("d2." + "x".repeat(40))).toBe(false);
  });

  it("hashes deterministically", () => {
    const plain = `${DEVICE_REFRESH_TOKEN_PREFIX}abc`;
    const first = hashDeviceRefreshToken(plain);
    expect(first).toBe(hashDeviceRefreshToken(plain));
    expect(first).not.toBe(hashDeviceRefreshToken(`${plain}x`));
  });
});
