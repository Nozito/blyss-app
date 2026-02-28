-- Sprint 6 — Admin: soft-disable user accounts
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
