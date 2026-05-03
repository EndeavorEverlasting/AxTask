-- Public-facing DM identifiers:
-- - public_handle: shareable handle users can type
-- - public_dm_token: high-entropy token for invite/QR payloads
-- Internal UUID user ids remain backend-only routing keys.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS public_handle text,
  ADD COLUMN IF NOT EXISTS public_dm_token text,
  ADD COLUMN IF NOT EXISTS public_handle_updated_at timestamp;

-- Ensure every user has a deterministic-safe unique handle.
WITH base AS (
  SELECT
    u.id,
    COALESCE(
      NULLIF(
        regexp_replace(
          lower(
            COALESCE(
              NULLIF(u.display_name, ''),
              split_part(u.email, '@', 1),
              'user'
            )
          ),
          '[^a-z0-9]+',
          '',
          'g'
        ),
        ''
      ),
      'user'
    ) AS root
  FROM users u
),
ranked AS (
  SELECT
    b.id,
    b.root,
    row_number() OVER (PARTITION BY b.root ORDER BY b.id) AS rn
  FROM base b
),
generated AS (
  SELECT
    r.id,
    CASE
      WHEN r.rn = 1 THEN 'ax_' || r.root
      ELSE 'ax_' || r.root || '_' || r.rn::text
    END AS handle
  FROM ranked r
)
UPDATE users u
SET public_handle = g.handle
FROM generated g
WHERE u.id = g.id
  AND (u.public_handle IS NULL OR btrim(u.public_handle) = '');

-- Regenerate any accidental duplicates from prior/manual data.
WITH dupes AS (
  SELECT
    id,
    public_handle,
    row_number() OVER (PARTITION BY lower(public_handle) ORDER BY id) AS rn
  FROM users
  WHERE public_handle IS NOT NULL
)
UPDATE users u
SET public_handle = lower(dupes.public_handle) || '_' || dupes.rn::text
FROM dupes
WHERE u.id = dupes.id
  AND dupes.rn > 1;

UPDATE users
SET public_handle = lower(public_handle)
WHERE public_handle IS NOT NULL;

-- Ensure every user has a token; 36 hex chars from core gen_random_uuid (no pgcrypto).
UPDATE users
SET public_dm_token = substring(
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  from 1 for 36
)
WHERE public_dm_token IS NULL OR btrim(public_dm_token) = '';

ALTER TABLE users
  ALTER COLUMN public_handle SET DEFAULT ('ax' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 12)),
  ALTER COLUMN public_dm_token SET DEFAULT (
    substring(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
      from 1 for 36
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS users_public_handle_unique ON users (public_handle);
CREATE UNIQUE INDEX IF NOT EXISTS users_public_dm_token_unique ON users (public_dm_token);

ALTER TABLE users
  ALTER COLUMN public_handle SET NOT NULL,
  ALTER COLUMN public_dm_token SET NOT NULL;
