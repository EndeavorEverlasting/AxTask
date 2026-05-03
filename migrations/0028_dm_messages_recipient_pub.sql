-- Store recipient ECDH public key used at encryption time so senders can decrypt
-- their own messages after peer key rotation or when multiple devices exist.
ALTER TABLE dm_messages
  ADD COLUMN IF NOT EXISTS recipient_pub_spki_b64 text;

-- Backfill is not possible for legacy rows; leave NULL and client falls back for old data.
