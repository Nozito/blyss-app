-- Refresh tokens were stored in plaintext, unlike password reset tokens
-- (which are hashed). A DB read (backup leak, insider access) would yield
-- directly usable refresh tokens. Store a SHA-256 hash instead, matching
-- the password_reset_tokens pattern.
--
-- Existing rows are plaintext values under the old column name and cannot
-- be converted in place — they're cleared, which forces every existing
-- session to re-authenticate on next refresh. Access tokens (15 min) keep
-- working until they expire naturally.

ALTER TABLE refresh_tokens RENAME COLUMN token TO token_hash;
DELETE FROM refresh_tokens;

ALTER INDEX idx_refresh_tokens_token RENAME TO idx_refresh_tokens_token_hash;
