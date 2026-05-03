-- RFC 6238 TOTP (authenticator apps). Secrets stored encrypted at rest (application layer).
-- Paste-friendly copy (keep in sync): sql/ops/totp-users-columns-apply.sql
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_secret_ciphertext" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_enabled_at" timestamp;
