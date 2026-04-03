import { describe, expect, it } from "vitest";
import { scanAttachmentBuffer } from "./attachment-scan";

describe("attachment-scan", () => {
  it("accepts png signature", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]);
    const result = scanAttachmentBuffer(png, "image/png");
    expect(result.clean).toBe(true);
  });

  it("rejects executable-like payload", () => {
    const bad = Buffer.from("<script>alert(1)</script>", "utf8");
    const result = scanAttachmentBuffer(bad, "image/png");
    expect(result.clean).toBe(false);
  });
});
