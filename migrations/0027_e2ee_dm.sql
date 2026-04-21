-- E2EE device identity (public keys only) and DM ciphertext (ECDH static-static + AES-GCM v1).

CREATE TABLE IF NOT EXISTS user_device_keys (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id varchar(160) NOT NULL,
  public_key_spki text NOT NULL,
  label text,
  created_at timestamp DEFAULT now(),
  last_seen_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_device_keys_user_device
  ON user_device_keys (user_id, device_id);

CREATE TABLE IF NOT EXISTS dm_conversations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dm_conversation_members (
  conversation_id varchar NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_dm_conversation_members_conv_user
  ON dm_conversation_members (conversation_id, user_id);

CREATE TABLE IF NOT EXISTS dm_messages (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id varchar NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
  sender_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_pub_spki_b64 text NOT NULL,
  ciphertext_b64 text NOT NULL,
  nonce_b64 text NOT NULL,
  content_encoding varchar(32) NOT NULL DEFAULT 'e2ee_ecdh_aes_gcm_v1',
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation_created
  ON dm_messages (conversation_id, created_at);
