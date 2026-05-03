/**
 * Browser WebCrypto for v1 DM payloads: ECDH P-256 (static keys) + AES-256-GCM.
 * Shared secret K = ECDH(senderPriv, recipientPub) === ECDH(recipientPriv, senderPub).
 */

const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;
const AES_GCM = { name: "AES-GCM", length: 256 } as const;

function pemToDer(pem: string): ArrayBuffer {
  const trimmed = pem.trim();
  const b64 = trimmed
    .replace(/-----BEGIN PUBLIC KEY-----/i, "")
    .replace(/-----END PUBLIC KEY-----/i, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function bufToB64(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return btoa(s);
}

function fromB64(s: string): ArrayBuffer {
  const bin = atob(s);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

export async function generateDmDeviceIdentity(): Promise<{
  keyPair: CryptoKeyPair;
  publicKeySpkiPem: string;
}> {
  const keyPair = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const spki = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const b64 = bufToB64(spki);
  const publicKeySpkiPem = `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g)?.join("\n") ?? b64}\n-----END PUBLIC KEY-----`;
  return { keyPair, publicKeySpkiPem };
}

function normalizePeerSpkiPem(pemOrSingleLineSpki: string): string {
  return pemOrSingleLineSpki.includes("BEGIN PUBLIC KEY")
    ? pemOrSingleLineSpki
    : `-----BEGIN PUBLIC KEY-----\n${pemOrSingleLineSpki.match(/.{1,64}/g)?.join("\n") ?? pemOrSingleLineSpki}\n-----END PUBLIC KEY-----`;
}

/** SPKI DER as base64 (same shape as `senderPubSpkiB64`) without importing the key (imported peer keys may be non-extractable). */
function peerSpkiDerB64FromInput(pemOrSingleLineSpki: string): string {
  const pem = normalizePeerSpkiPem(pemOrSingleLineSpki).trim();
  return bufToB64(pemToDer(pem));
}

async function importPeerPublicEcdh(pemOrSingleLineSpki: string): Promise<CryptoKey> {
  const pem = normalizePeerSpkiPem(pemOrSingleLineSpki);
  return crypto.subtle.importKey("spki", pemToDer(pem), ECDH, false, []);
}

async function sha256AesKeyFromSharedSecret(sharedBits: ArrayBuffer): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest("SHA-256", sharedBits);
  return crypto.subtle.importKey("raw", hash, AES_GCM, false, ["encrypt", "decrypt"]);
}

/** Encrypt using this device's ECDH private key + recipient's SPKI public key. */
export async function encryptDmUtf8(
  myPrivateKey: CryptoKey,
  myPublicKey: CryptoKey,
  recipientPublicKeySpki: string,
  plaintextUtf8: string,
): Promise<{
  ciphertextB64: string;
  nonceB64: string;
  senderPubSpkiB64: string;
  /** SPKI DER base64 of the recipient public key used for ECDH (needed for sender-side decrypt). */
  recipientPubSpkiB64: string;
}> {
  const recipientPub = await importPeerPublicEcdh(recipientPublicKeySpki);
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: recipientPub }, myPrivateKey, 256);
  const aesKey = await sha256AesKeyFromSharedSecret(shared);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(plaintextUtf8);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, pt);
  const myPubDer = await crypto.subtle.exportKey("spki", myPublicKey);
  return {
    ciphertextB64: bufToB64(ct),
    nonceB64: bufToB64(iv.buffer),
    senderPubSpkiB64: bufToB64(myPubDer),
    recipientPubSpkiB64: peerSpkiDerB64FromInput(recipientPublicKeySpki),
  };
}

/** Decrypt using viewer's ECDH private key + the other party's SPKI (DER base64 from `senderPubSpkiB64`). */
export async function decryptDmUtf8(
  myPrivateKey: CryptoKey,
  otherPartyPublicSpkiB64: string,
  ciphertextB64: string,
  nonceB64: string,
): Promise<string> {
  const otherPub = await crypto.subtle.importKey(
    "spki",
    fromB64(otherPartyPublicSpkiB64.trim()),
    ECDH,
    false,
    [],
  );
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: otherPub }, myPrivateKey, 256);
  const aesKey = await sha256AesKeyFromSharedSecret(shared);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(fromB64(nonceB64)) },
    aesKey,
    fromB64(ciphertextB64),
  );
  return new TextDecoder().decode(pt);
}
