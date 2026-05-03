-- Verify TOTP-related columns exist on public.users (after migration 0006 or equivalent).
-- Safe read-only; use in Neon SQL Editor against production branch.

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name IN ('totp_secret_ciphertext', 'totp_enabled_at')
ORDER BY column_name;
