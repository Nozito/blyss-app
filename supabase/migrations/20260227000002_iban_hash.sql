-- Sprint 2: Add iban_hash for deduplication (replaces MySQL SHA2() which doesn't exist in PostgreSQL)
-- SHA-256 of the plaintext IBAN, used only for duplicate detection — not for decryption.
ALTER TABLE users ADD COLUMN IF NOT EXISTS iban_hash VARCHAR(64);

-- Index for fast dedup lookup
CREATE INDEX IF NOT EXISTS idx_users_iban_hash ON users(iban_hash) WHERE iban_hash IS NOT NULL;
