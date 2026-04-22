// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { decryptDmUtf8, encryptDmUtf8, generateDmDeviceIdentity } from "./e2ee-dm-crypto";

if (!globalThis.crypto) {
  (globalThis as unknown as { crypto: Crypto }).crypto = webcrypto as unknown as Crypto;
}

describe("e2ee-dm-crypto", () => {
  afterAll(() => {
    // leave global crypto for other tests in same worker — node provides it anyway
  });

  it("round-trips UTF-8 between two device keypairs", async () => {
    const alice = await generateDmDeviceIdentity();
    const bob = await generateDmDeviceIdentity();
    const plain = "Hello 世界 🔐";
    const enc = await encryptDmUtf8(
      alice.keyPair.privateKey,
      alice.keyPair.publicKey,
      bob.publicKeySpkiPem,
      plain,
    );
    const outBob = await decryptDmUtf8(bob.keyPair.privateKey, enc.senderPubSpkiB64, enc.ciphertextB64, enc.nonceB64);
    expect(outBob).toBe(plain);
    const outAlice = await decryptDmUtf8(
      alice.keyPair.privateKey,
      enc.recipientPubSpkiB64,
      enc.ciphertextB64,
      enc.nonceB64,
    );
    expect(outAlice).toBe(plain);
  });
});
