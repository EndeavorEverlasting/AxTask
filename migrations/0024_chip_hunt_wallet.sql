-- Ambient chip hunt: cumulative chase time + catch count for hidden badges (not in PublicWallet).
ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS chip_chase_ms_total bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chip_catches_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chip_hunt_last_sync_at timestamp;
