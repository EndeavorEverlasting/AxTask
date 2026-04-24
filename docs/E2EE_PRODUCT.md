# E2EE product contract (AxTask)

This document describes **explicit** end-to-end encryption features as shipped in the product. Marketing and in-app copy should match this contract.

## Threat model (v1)

- **Server:** Stores **ciphertext** for DM payloads and **public** device keys only. It does **not** receive DM plaintext on the wire for the encrypted POST path.
- **Transport:** TLS still protects metadata (who talks to whom, message sizes, timestamps).
- **Moderation / search:** Server-side plaintext moderation **does not** apply to E2EE DM bodies. Abuse handling for v1 relies on user reports and account actions, not server-side content scanning of ciphertext.
- **Loss of device:** If browser storage (IndexedDB) holding the private key is cleared without a backup you have not implemented yet, **historical DMs cannot be decrypted** on that device.

## Cryptography (v1 direct messages)

- **KEM / key agreement:** ECDH **P-256** static keys per browser device.
- **Symmetric:** AES-256-GCM; key material derived from the ECDH shared secret via **SHA-256** (256-bit key).
- **On the wire to AxTask:** `ciphertext_b64`, `nonce_b64`, `sender_pub_spki_b64`, plus routing fields. The pairing `recipient_user_id` is inferred server-side for 1:1 threads.

## Device keys

- Each browser generates an ECDH keypair; the **private** key stays in **IndexedDB** (`axtask_e2ee_v1`).
- `POST /api/e2ee/devices` registers the **public** SPKI (PEM) on the server (`user_device_keys`).

## API surface (summary)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/e2ee/devices` | Register or rotate this browser’s public key |
| GET | `/api/e2ee/devices` | List own device public keys |
| GET | `/api/e2ee/conversations/:id/peer-devices` | List peer public keys for a conversation member |
| GET | `/api/dm/public-identity` | Return own public handle + invite token for sharing |
| POST | `/api/dm/conversations` | Create or return a 1:1 conversation id |
| GET | `/api/dm/conversations` | List conversations for the session user |
| GET | `/api/dm/conversations/:id/messages` | List ciphertext messages |
| POST | `/api/dm/conversations/:id/messages` | Append ciphertext message |

## Roadmap (not yet product claims)

- **Community / collab / feedback ciphertext:** same envelope pattern with per-surface metadata and migration from legacy plaintext.
- **Forward secrecy:** ratchet or per-message ephemeral sender keys beyond v1 static-static ECDH.
- **Recovery:** passphrase-wrapped key export, optional hardware token.

## Age gating (related)

Starting a DM or sending an E2EE message requires the same **public participation age** checks as community / collab / feedback posting (default **13+**, optional `PUBLIC_PARTICIPATION_MIN_AGE`). See server `assertEligibleForPublicParticipation`.
