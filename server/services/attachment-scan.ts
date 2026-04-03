type ScanResult = {
  clean: boolean;
  reason?: string;
};

const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const jpgSig = Buffer.from([0xff, 0xd8, 0xff]);
const gifSig = Buffer.from([0x47, 0x49, 0x46, 0x38]);
const webpRiff = Buffer.from([0x52, 0x49, 0x46, 0x46]);
const webpWebp = Buffer.from([0x57, 0x45, 0x42, 0x50]);

function startsWith(buf: Buffer, sig: Buffer): boolean {
  return buf.length >= sig.length && buf.subarray(0, sig.length).equals(sig);
}

export function scanAttachmentBuffer(buffer: Buffer, mimeType: string): ScanResult {
  if (buffer.length === 0) return { clean: false, reason: "Empty file" };
  if (buffer.length > 10 * 1024 * 1024) return { clean: false, reason: "File exceeds scan limit" };

  const lowerMime = mimeType.toLowerCase();
  if (!lowerMime.startsWith("image/")) {
    return { clean: false, reason: "Only image attachments are allowed" };
  }

  const looksPng = startsWith(buffer, pngSig);
  const looksJpg = startsWith(buffer, jpgSig);
  const looksGif = startsWith(buffer, gifSig);
  const looksWebp = buffer.length > 12 && startsWith(buffer, webpRiff) && buffer.subarray(8, 12).equals(webpWebp);

  if (!looksPng && !looksJpg && !looksGif && !looksWebp) {
    return { clean: false, reason: "File signature does not match a supported image type" };
  }

  const suspiciousAscii = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("utf8").toLowerCase();
  if (suspiciousAscii.includes("<script") || suspiciousAscii.includes("powershell")) {
    return { clean: false, reason: "Suspicious executable payload markers detected" };
  }

  return { clean: true };
}
