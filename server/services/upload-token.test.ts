import { describe, expect, it } from "vitest";
import { createUploadToken, verifyUploadToken } from "./upload-token";

describe("upload-token", () => {
  it("round-trips valid tokens", () => {
    const token = createUploadToken({
      userId: "u1",
      assetId: "a1",
      storageKey: "u1/2026-01-01/a1-file.png",
      mimeType: "image/png",
      byteSize: 123,
      exp: Date.now() + 60_000,
    }, "secret");
    const parsed = verifyUploadToken(token, "secret");
    expect(parsed?.userId).toBe("u1");
    expect(parsed?.assetId).toBe("a1");
  });

  it("rejects invalid signature", () => {
    const token = createUploadToken({
      userId: "u1",
      assetId: "a1",
      storageKey: "x",
      mimeType: "image/png",
      byteSize: 1,
      exp: Date.now() + 60_000,
    }, "secret");
    expect(verifyUploadToken(token, "wrong")).toBeNull();
  });
});
