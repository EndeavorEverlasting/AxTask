import { createHmac, timingSafeEqual } from "crypto";

export type UploadTokenPayload = {
  userId: string;
  assetId: string;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  exp: number;
};

function b64urlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function b64urlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

export function createUploadToken(payload: UploadTokenPayload, secret: string): string {
  const payloadB64 = b64urlEncode(JSON.stringify(payload));
  const signature = sign(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

export function verifyUploadToken(token: string, secret: string): UploadTokenPayload | null {
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return null;
  const expected = sign(payloadB64, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return null;
  const validSig = timingSafeEqual(left, right);
  if (!validSig) return null;

  let parsed: UploadTokenPayload;
  try {
    parsed = JSON.parse(b64urlDecode(payloadB64)) as UploadTokenPayload;
  } catch {
    return null;
  }
  if (!parsed?.exp || Date.now() > parsed.exp) return null;
  return parsed;
}
